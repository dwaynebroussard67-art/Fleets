import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { type Shift } from "../lib/fleet";

test("shift correction RPC enforces ownership, snapshot conflicts, and table constraints", async (t) => {
  const db = new PGlite();
  const alice = "11111111-1111-4111-8111-111111111111",
    bob = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated;
      insert into auth.users values('${alice}'),('${bob}');`);
    for (const name of [
      "schema.sql",
      "migrations/003_shift_corrections.sql",
      "migrations/003_shift_corrections.sql",
    ])
      await db.exec(
        await readFile(new URL(`../supabase/${name}`, import.meta.url), "utf8"),
      );
    const asUser = async (id: string) => {
      await db.exec("reset role;set role authenticated;");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
    };
    const original: Shift = {
      id: crypto.randomUUID(),
      platform: "DoorDash",
      date: "2026-01-02",
      time: "10:00",
      duration: 3,
      deliveries: 12,
      earnings: 80,
      note: "Original private note",
      recognition: "3 hours recorded.",
    };
    const corrected = {
      ...original,
      duration: 4,
      deliveries: 15,
      recognition: "4 hours recorded.",
    };
    const edit = async (
      expected: unknown,
      replacement: unknown,
      id = original.id,
    ) =>
      (
        await db.query<{ record: Shift }>(
          "select public.fleet_update_shift($1,$2,$3) as record",
          [id, JSON.stringify(expected), JSON.stringify(replacement)],
        )
      ).rows[0].record;
    await asUser(alice);
    await db.query(
      "insert into public.shifts(id,user_id,data) values($1,$2,$3)",
      [original.id, alice, JSON.stringify(original)],
    );
    await t.test(
      "another user and anonymous callers cannot correct or discover the shift",
      async () => {
        await asUser(bob);
        await assert.rejects(
          edit(original, corrected),
          /FLEET_SHIFT_UNAVAILABLE/,
        );
        await db.exec("reset role;set role anon;");
        await assert.rejects(edit(original, corrected), /permission denied/);
        await asUser(alice);
      },
    );
    await t.test(
      "the owner can correct one shift without losing its identity or note",
      async () => {
        assert.deepEqual(await edit(original, corrected), corrected);
        assert.equal(
          (await db.query("select * from public.shifts")).rows.length,
          1,
        );
      },
    );
    await t.test(
      "stale snapshots cannot overwrite a newer correction, but identical retries succeed",
      async () => {
        await assert.rejects(
          edit(original, { ...original, note: "Stale replacement" }),
          /FLEET_SHIFT_CONFLICT/,
        );
        assert.deepEqual(await edit(original, corrected), corrected);
        await assert.rejects(
          edit(null, { ...corrected, note: "No snapshot" }),
          /FLEET_SHIFT_CONFLICT/,
        );
      },
    );
    await t.test(
      "invalid values, duplicate timestamps, and changed IDs roll back",
      async () => {
        await assert.rejects(
          edit(corrected, { ...corrected, duration: -1 }),
          /shift_duration/,
        );
        await assert.rejects(
          edit(corrected, { ...corrected, id: crypto.randomUUID() }),
          /Invalid replacement/,
        );
        const other = { ...original, id: crypto.randomUUID(), time: "11:00" };
        await db.query(
          "insert into public.shifts(id,user_id,data) values($1,$2,$3)",
          [other.id, alice, JSON.stringify(other)],
        );
        await assert.rejects(
          edit(corrected, { ...corrected, time: "11:00" }),
          /shifts_no_duplicate/,
        );
        assert.deepEqual(
          (
            await db.query<{ data: Shift }>(
              "select data from public.shifts where id=$1",
              [original.id],
            )
          ).rows[0].data,
          corrected,
        );
      },
    );
    await t.test(
      "direct UPDATE remains denied and private text can be intentionally removed",
      async () => {
        await assert.rejects(
          db.query("update public.shifts set data=$1 where id=$2", [
            JSON.stringify(original),
            original.id,
          ]),
          /permission denied/,
        );
        const cleared = { ...corrected, note: "" };
        assert.equal((await edit(corrected, cleared)).note, "");
        await db.query("delete from public.shifts where id=$1", [original.id]);
        await assert.rejects(
          edit(cleared, corrected),
          /FLEET_SHIFT_UNAVAILABLE/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
