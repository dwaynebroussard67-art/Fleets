import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { emptyProfile, localDate } from "../lib/fleet";

test("Postgres schema enforces ownership, constraints, and account-data deletion", async () => {
  const db = new PGlite();
  const alice = "11111111-1111-4111-8111-111111111111",
    bob = "22222222-2222-4222-8222-222222222222";
  try {
    // Supabase provides these roles, auth.users and auth.uid in a hosted project.
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth, public to authenticated, anon;
      grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('${alice}'),('${bob}');`);
    await db.exec(
      await readFile(
        new URL("../supabase/schema.sql", import.meta.url),
        "utf8",
      ),
    );
    const asUser = async (id: string) => {
      await db.exec(`reset role; set role authenticated;`);
      await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
        id,
      ]);
    };
    await asUser(alice);
    await db.query("insert into public.profiles(id,data) values ($1,$2)", [
      alice,
      JSON.stringify({ ...emptyProfile, name: "Alice" }),
    ]);
    const shiftId = crypto.randomUUID();
    const shift = {
      id: shiftId,
      platform: "DoorDash",
      date: localDate(),
      time: "10:00",
      duration: 3,
      deliveries: 9,
      earnings: 60,
      note: "ALICE PRIVATE",
      recognition: "3 hours, 9 deliveries.",
    };
    await db.query(
      "insert into public.shifts(id,user_id,data) values ($1,$2,$3)",
      [shiftId, alice, JSON.stringify(shift)],
    );
    assert.equal(
      (await db.query("select * from public.shifts")).rows.length,
      1,
    );
    await assert.rejects(
      db.query("insert into public.profiles(id,data) values ($1,$2)", [
        bob,
        JSON.stringify(emptyProfile),
      ]),
      /row-level security/,
    );
    await assert.rejects(
      db.query("update public.profiles set data=$1 where id=$2", [
        JSON.stringify({ ...emptyProfile, rating: 8 }),
        alice,
      ]),
      /profile_rating/,
    );
    await assert.rejects(
      db.query("update public.profiles set data=$1 where id=$2", [
        JSON.stringify({ ...emptyProfile, contributions: null }),
        alice,
      ]),
      /profile_types/,
    );
    const otherId = crypto.randomUUID();
    await assert.rejects(
      db.query("insert into public.shifts(id,user_id,data) values ($1,$2,$3)", [
        otherId,
        alice,
        JSON.stringify({ ...shift, id: otherId }),
      ]),
      /shifts_no_duplicate/,
    );
    await asUser(bob);
    assert.equal(
      (await db.query("select * from public.shifts")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.profiles")).rows.length,
      0,
    );
    await db.query("delete from public.shifts where id=$1", [shiftId]);
    await assert.rejects(
      db.query("insert into public.shifts(id,user_id,data) values ($1,$2,$3)", [
        otherId,
        alice,
        JSON.stringify({ ...shift, id: otherId }),
      ]),
      /row-level security/,
    );
    await assert.rejects(
      db.query("update public.shifts set data=$1 where id=$2", [
        JSON.stringify(shift),
        shiftId,
      ]),
      /permission denied/,
    );
    await db.exec("reset role; set role anon;");
    await assert.rejects(
      db.query("select * from public.shifts"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from public.profiles"),
      /permission denied/,
    );
    await asUser(alice);
    assert.equal(
      (await db.query("select * from public.shifts")).rows.length,
      1,
      "Bob cannot delete Alice’s shift",
    );
    await db.query("delete from public.shifts where id=$1", [shiftId]);
    assert.equal(
      (await db.query("select * from public.shifts")).rows.length,
      0,
    );
    await db.exec("reset role;");
    await db.query("delete from auth.users where id=$1", [alice]);
    assert.equal(
      (await db.query("select * from public.profiles")).rows.length,
      0,
      "Auth user deletion cascades",
    );
  } finally {
    await db.close();
  }
});
