import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { emptyProfile, localDate } from "../lib/fleet";

test("account-control RPCs preserve data and enforce security in Postgres", async (t) => {
  const db = new PGlite();
  const alice = "11111111-1111-4111-8111-111111111111",
    bob = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      grant usage on schema auth,public to authenticated,anon;
      grant execute on function auth.uid(),auth.jwt() to authenticated;
      insert into auth.users values('${alice}'),('${bob}');`);
    for (const path of [
      "../supabase/schema.sql",
      "../supabase/migrations/002_account_controls.sql",
    ])
      await db.exec(await readFile(new URL(path, import.meta.url), "utf8"));
    // Migration must also be safe to re-run on an existing deployment.
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/002_account_controls.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const asUser = async (id: string) => {
      await db.exec("reset role;set role authenticated;");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
    };
    const shift = {
      id: crypto.randomUUID(),
      date: localDate(),
      time: "10:00",
      platform: "DoorDash",
      duration: 3,
      deliveries: 10,
      earnings: 75,
      note: "Alice private",
      recognition: "Three hours on the road.",
    };
    const call = async (records: unknown[], profile: unknown = null) =>
      (
        await db.query<{
          result: { added: (typeof shift)[]; skipped: number };
        }>("select public.fleet_import_record($1,$2) as result", [
          JSON.stringify(records),
          profile === null ? null : JSON.stringify(profile),
        ])
      ).rows[0].result;
    await asUser(alice);
    await t.test(
      "imports atomically, re-keys IDs, and never overwrites duplicate notes",
      async () => {
        const first = await call([shift], { ...emptyProfile, name: "Alice" });
        assert.equal(first.added.length, 1);
        assert.notEqual(first.added[0].id, shift.id);
        const retry = await call([{ ...shift, note: "overwrite attempt" }]);
        assert.equal(retry.skipped, 1);
        assert.equal(retry.added.length, 0);
        const rows = await db.query<{ data: typeof shift }>(
          "select data from public.shifts",
        );
        assert.equal(rows.rows[0].data.note, "Alice private");
      },
    );
    await t.test(
      "a later invalid row or profile rolls back the whole import",
      async () => {
        await assert.rejects(
          call([
            { ...shift, time: "11:00" },
            { ...shift, time: "12:00", duration: -1 },
          ]),
          /shift_duration/,
        );
        await assert.rejects(
          call([{ ...shift, time: "13:00" }], { ...emptyProfile, rating: 9 }),
          /profile_rating/,
        );
        assert.equal(
          (await db.query("select * from public.shifts")).rows.length,
          1,
        );
        assert.equal(
          (
            await db.query<{ data: { name: string } }>(
              "select data from public.profiles",
            )
          ).rows[0].data.name,
          "Alice",
        );
      },
    );
    await t.test(
      "another driver can import the same portable file without accessing the original",
      async () => {
        await asUser(bob);
        assert.equal(
          (await db.query("select * from public.shifts")).rows.length,
          0,
        );
        const copy = await call([shift], { ...emptyProfile, name: "Bob" });
        assert.equal(copy.added.length, 1);
        assert.equal(
          (
            await db.query<{ user_id: string }>(
              "select user_id from public.shifts",
            )
          ).rows[0].user_id,
          bob,
        );
      },
    );
    await t.test(
      "anonymous users cannot call imports or deletion",
      async () => {
        await db.exec("reset role;set role anon;");
        await assert.rejects(call([]), /permission denied/);
        await assert.rejects(
          db.query(
            "select public.fleet_delete_my_account('DELETE MY ACCOUNT')",
          ),
          /permission denied/,
        );
      },
    );
    await t.test(
      "deletion fails without exact confirmation and fresh password proof",
      async () => {
        await asUser(alice);
        await assert.rejects(
          db.query("select public.fleet_delete_my_account('yes')"),
          /confirmation/,
        );
        await assert.rejects(
          db.query("select public.fleet_delete_my_account(null)"),
          /confirmation/,
        );
        for (const amr of [
          [],
          [{ method: "password", timestamp: 1 }],
          [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) }],
        ]) {
          await db.query("select set_config('request.jwt.claims',$1,false)", [
            JSON.stringify({ amr }),
          ]);
          await assert.rejects(
            db.query(
              "select public.fleet_delete_my_account('DELETE MY ACCOUNT')",
            ),
            /Sign in with your password/,
          );
        }
        assert.equal(
          (await db.query("select * from public.shifts")).rows.length,
          1,
        );
      },
    );
    await t.test(
      "fresh password proof deletes only the caller and cascades all their live records",
      async () => {
        await db.query("select set_config('request.jwt.claims',$1,false)", [
          JSON.stringify({
            amr: [
              { method: "password", timestamp: Math.floor(Date.now() / 1000) },
            ],
          }),
        ]);
        await db.query(
          "select public.fleet_delete_my_account('DELETE MY ACCOUNT')",
        );
        assert.equal(
          (await db.query("select * from public.shifts")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from public.profiles")).rows.length,
          0,
        );
        await asUser(bob);
        assert.equal(
          (await db.query("select * from public.shifts")).rows.length,
          1,
        );
        await db.exec("reset role;");
        assert.deepEqual((await db.query("select id from auth.users")).rows, [
          { id: bob },
        ]);
      },
    );
  } finally {
    await db.close();
  }
});
