import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  passwordSchema,
  requestPasswordReset,
  RESET_SENT_MESSAGE,
  updatePassword,
} from "../lib/auth";
const client = (auth: unknown) => ({ auth }) as Pick<SupabaseClient, "auth">;

test("reset requests validate email and use a fixed same-origin recovery path", async () => {
  const calls: unknown[] = [];
  const api = client({
    resetPasswordForEmail: async (...args: unknown[]) => {
      calls.push(args);
      return { error: null };
    },
  });
  assert.equal(
    await requestPasswordReset(
      api,
      "  driver@example.com  ",
      "https://3000-sandbox.e2b.app",
    ),
    RESET_SENT_MESSAGE,
  );
  assert.deepEqual(calls, [
    [
      "driver@example.com",
      { redirectTo: "https://3000-sandbox.e2b.app/reset-password" },
    ],
  ]);
  await assert.rejects(
    requestPasswordReset(api, "bad", "https://fleet.example"),
    /valid email/,
  );
  assert.equal(calls.length, 1);
});
test("reset failures never expose backend account existence details", async () => {
  const api = client({
    resetPasswordForEmail: async () => ({
      error: { message: "No user driver@example.com", status: 400 },
    }),
  });
  await assert.rejects(
    requestPasswordReset(api, "driver@example.com", "https://fleet.example"),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /couldn’t send/);
      assert.ok(!err.message.includes("No user"));
      return true;
    },
  );
});
test("password confirmation and length are validated before calling auth", () => {
  assert.ok(
    passwordSchema.safeParse({
      password: "strong-pass",
      confirmation: "strong-pass",
    }).success,
  );
  for (const v of [
    { password: "short", confirmation: "short" },
    { password: "long-password", confirmation: "other" },
    { password: "x".repeat(129), confirmation: "x".repeat(129) },
  ])
    assert.ok(!passwordSchema.safeParse(v).success);
});
test("password changes require a valid user and do not submit mismatched passwords", async () => {
  let updates = 0;
  const api = client({
    getUser: async () => ({ data: { user: { id: "driver" } }, error: null }),
    updateUser: async () => {
      updates++;
      return { error: null };
    },
  });
  await assert.rejects(
    updatePassword(api, "long-password", "different"),
    /don’t match/,
  );
  assert.equal(updates, 0);
  await updatePassword(api, "long-password", "long-password");
  assert.equal(updates, 1);
  const expired = client({
    getUser: async () => ({
      data: { user: null },
      error: new Error("expired"),
    }),
    updateUser: async () => {
      updates++;
    },
  });
  await assert.rejects(
    updatePassword(expired, "long-password", "long-password"),
    /expired/,
  );
  assert.equal(updates, 1);
});
