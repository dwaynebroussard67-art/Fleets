import { test, expect, type Page } from "@playwright/test";
import { emptyProfile } from "../../lib/fleet";
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "driver@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { name: "Jordan Miles" },
  created_at: "2026-01-01T00:00:00Z",
};
function session() {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (data: unknown) =>
    Buffer.from(JSON.stringify(data)).toString("base64url");
  return {
    access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, role: "authenticated", email: user.email, aud: "authenticated", exp: now + 3600, iat: now, amr: [{ method: "password", timestamp: now }] })}.testsignature`,
    refresh_token: "test-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    user,
  };
}
async function mockBackend(page: Page, signedIn = false) {
  const calls: {
    path: string;
    method: string;
    body: Record<string, unknown> | null;
  }[] = [];
  if (signedIn)
    await page.addInitScript(
      (value) =>
        localStorage.setItem("sb-fleet-test-auth-token", JSON.stringify(value)),
      session(),
    );
  await page.route("https://fleet-test.supabase.co/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    const body = request.postData() ? request.postDataJSON() : null;
    calls.push({ path, method: request.method(), body });
    let response: unknown = {};
    let status = 200;
    if (path === "/auth/v1/user") response = user;
    else if (path === "/auth/v1/token") {
      if (body?.password === "wrong-password") {
        status = 400;
        response = {
          code: "invalid_credentials",
          msg: "Invalid login credentials",
        };
      } else response = session();
    } else if (path === "/rest/v1/profiles")
      response = [{ data: { ...emptyProfile, name: "Jordan Miles" } }];
    else if (path === "/rest/v1/shifts") response = [];
    else if (path === "/rest/v1/rpc/fleet_delete_my_account") response = null;
    else if (path === "/auth/v1/recover" || path === "/auth/v1/logout")
      response = {};
    else {
      status = 400;
      response = { message: `Unexpected test request ${path}` };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  return calls;
}
test("forgot-password form sends a same-origin reset request and neutral success message", async ({
  page,
}) => {
  const calls = await mockBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Demo workspace" }).click();
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Forgot your password?" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await page.getByLabel("Email address").fill(user.email);
  const request = page.waitForRequest((r) =>
    r.url().includes("/auth/v1/recover"),
  );
  await page.getByRole("button", { name: "Send reset link" }).click();
  expect(new URL((await request).url()).searchParams.get("redirect_to")).toBe(
    new URL("/reset-password", page.url()).href,
  );
  await expect(page.getByRole("status")).toContainText("If an account exists");
  expect(calls.find((c) => c.path === "/auth/v1/recover")?.body?.email).toBe(
    user.email,
  );
});
test("recovery session validates password confirmation and updates through Supabase auth", async ({
  page,
}) => {
  const calls = await mockBackend(page, true);
  await page.goto("/reset-password");
  await expect(
    page.getByRole("heading", { name: "Choose a new password." }),
  ).toBeVisible();
  await page.locator('input[name="password"]').fill("better-password");
  await page.getByLabel("Confirm new password").fill("does-not-match");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.locator('.error-banner[role="alert"]')).toContainText(
    "don’t match",
  );
  expect(
    calls.filter((c) => c.path === "/auth/v1/user" && c.method === "PUT"),
  ).toHaveLength(0);
  await page.getByLabel("Confirm new password").fill("better-password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(
    page.getByRole("heading", { name: "A fresh start." }),
  ).toBeVisible();
  expect(
    calls.find((c) => c.path === "/auth/v1/user" && c.method === "PUT")?.body
      ?.password,
  ).toBe("better-password");
});
test("expired recovery links expose no tokens and offer a new reset request", async ({
  page,
}) => {
  await mockBackend(page);
  await page.goto(
    "/reset-password#error=access_denied&error_description=Expired_link",
  );
  await expect(page.locator('.error-banner[role="alert"]')).toContainText(
    "invalid or has expired",
  );
  await expect(
    page.getByRole("button", { name: "Send reset link" }),
  ).toBeVisible();
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
  expect(page.url()).not.toContain("error_description");
});
test("deletion requires typed confirmation and password reauthentication; repeated sign-in does not reset the dialog", async ({
  page,
}) => {
  const calls = await mockBackend(page, true);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good to see you, Jordan." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Permanently delete account" }),
  ).toBeDisabled();
  await page.getByLabel("Current password").fill("wrong-password");
  await page
    .getByLabel("Type DELETE MY ACCOUNT to confirm")
    .fill("DELETE MY ACCOUNT");
  await page
    .getByRole("button", { name: "Permanently delete account" })
    .click();
  await expect(page.locator('.error-banner[role="alert"]')).toContainText(
    "couldn’t confirm your password",
  );
  expect(
    calls.filter((c) => c.path.includes("fleet_delete_my_account")),
  ).toHaveLength(0);
  await page.getByLabel("Current password").fill("correct-password");
  await page
    .getByRole("button", { name: "Permanently delete account" })
    .click();
  await expect(
    page.getByRole("button", { name: "Demo workspace" }),
  ).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue("Alex Morgan");
  expect(
    calls.filter((c) => c.path.includes("fleet_delete_my_account")),
  ).toHaveLength(1);
  expect(
    calls.find((c) => c.path.includes("fleet_delete_my_account"))?.body,
  ).toEqual({ confirmation: "DELETE MY ACCOUNT" });
});

test("cloud imports fail without changing state, then retry atomically without silently replacing a profile", async ({
  page,
}) => {
  await mockBackend(page, true);
  let fail = true;
  let calls = 0;
  let stored: Record<string, unknown>[] = [];
  await page.route(
    "https://fleet-test.supabase.co/rest/v1/shifts?**",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(stored.map((data) => ({ data }))),
      }),
  );
  await page.route(
    "https://fleet-test.supabase.co/rest/v1/rpc/fleet_import_record",
    async (route) => {
      calls++;
      const body = route.request().postDataJSON();
      expect(body.imported_profile).toBeNull();
      if (fail)
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: "test constraint violation" }),
        });
      else {
        stored = body.records.map((s: Record<string, unknown>) => ({
          ...s,
          id: crypto.randomUUID(),
        }));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ added: stored, skipped: 0 }),
        });
      }
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await page.getByRole("button", { name: "Import a record" }).click();
  const record = {
    version: 1,
    source: "FLEET",
    profile: { ...emptyProfile, name: "Different Driver" },
    shifts: [
      {
        id: crypto.randomUUID(),
        platform: "DoorDash",
        date: "2026-01-01",
        time: "10:00",
        duration: 2,
        deliveries: 8,
        earnings: 55,
        recognition: "Two hours recorded.",
      },
    ],
  };
  await page.getByLabel("Fleet JSON file").setInputFiles({
    name: "cloud-import.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(record)),
  });
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.locator('.error-banner[role="alert"]')).toContainText(
    "couldn’t confirm the import",
  );
  await expect(page.getByLabel("Full name")).toHaveValue("Jordan Miles");
  fail = false;
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Imported 1 shift");
  await expect(page.getByLabel("Full name")).toHaveValue("Jordan Miles");
  await page.getByRole("button", { name: "My shifts", exact: true }).click();
  await expect(page.getByRole("cell", { name: "$55.00" })).toBeVisible();
  expect(calls).toBe(2);
});

test("a committed import with a failed refresh is reported as saved, not silently retried", async ({
  page,
}) => {
  await mockBackend(page, true);
  let stored: Record<string, unknown>[] = [];
  let failRefresh = false;
  let rpcCalls = 0;
  await page.route(
    "https://fleet-test.supabase.co/rest/v1/shifts?**",
    (route) =>
      route.fulfill({
        status: failRefresh ? 400 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          failRefresh
            ? { message: "test unavailable" }
            : stored.map((data) => ({ data })),
        ),
      }),
  );
  await page.route(
    "https://fleet-test.supabase.co/rest/v1/rpc/fleet_import_record",
    async (route) => {
      rpcCalls++;
      stored = route
        .request()
        .postDataJSON()
        .records.map((s: Record<string, unknown>) => ({
          ...s,
          id: crypto.randomUUID(),
        }));
      failRefresh = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ added: stored, skipped: 0 }),
      });
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await page.getByRole("button", { name: "Import a record" }).click();
  const record = {
    version: 1,
    source: "FLEET",
    profile: emptyProfile,
    shifts: [
      {
        id: crypto.randomUUID(),
        platform: "Uber Eats",
        date: "2026-01-01",
        time: "13:00",
        duration: 3,
        deliveries: 10,
        earnings: 91.5,
        recognition: "Your work is recorded.",
      },
    ],
  };
  await page.getByLabel("Fleet JSON file").setInputFiles({
    name: "saved.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(record)),
  });
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.locator('.error-banner[role="alert"]')).toContainText(
    "Your import was saved",
  );
  await expect(
    page.getByRole("button", { name: "Confirm import" }),
  ).toBeDisabled();
  expect(rpcCalls).toBe(1);
  failRefresh = false;
  await page.getByRole("button", { name: "Reload workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Good to see you, Jordan." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My shifts", exact: true }).click();
  await expect(page.getByRole("cell", { name: "$91.50" })).toBeVisible();
  expect(rpcCalls).toBe(1);
});

test("cloud shift correction retries safely and never falls back to deleting or creating a row", async ({
  page,
}) => {
  const calls = await mockBackend(page, true);
  const original = {
    id: crypto.randomUUID(),
    platform: "DoorDash",
    date: "2026-01-02",
    time: "10:00",
    duration: 3,
    deliveries: 12,
    earnings: 80,
    note: "Keep this private cloud note.",
    recognition: "Original recognition.",
  };
  let stored = { ...original };
  let fail = true;
  let corrections = 0;
  await page.route(
    "https://fleet-test.supabase.co/rest/v1/shifts?**",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ data: stored }]),
      }),
  );
  await page.route(
    "https://fleet-test.supabase.co/rest/v1/rpc/fleet_update_shift",
    async (route) => {
      corrections++;
      const data = route.request().postDataJSON();
      expect(data.shift_id).toBe(original.id);
      expect(data.expected_data).toEqual(original);
      expect(data.replacement_data.note).toBe(original.note);
      expect(route.request().headers().authorization).toMatch(/^Bearer /);
      if (fail)
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            code: "PGRST202",
            message: "test unavailable",
          }),
        });
      else {
        stored = data.replacement_data;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(stored),
        });
      }
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "My shifts", exact: true }).click();
  await page.locator("tbody tr").first().getByRole("button").first().click();
  await page.getByRole("button", { name: "Edit shift", exact: true }).click();
  await page.getByLabel("Duration (hours)").fill("5");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator('.error-banner[role="alert"]')).toContainText(
    "couldn’t confirm this correction",
  );
  await expect(page.getByLabel("Duration (hours)")).toHaveValue("5");
  fail = false;
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".recognition-detail")).toContainText("5 hours");
  await expect(page.getByText(original.note, { exact: true })).toBeVisible();
  expect(stored.id).toBe(original.id);
  expect(corrections).toBe(2);
  expect(
    calls.filter((c) => c.path === "/rest/v1/shifts" && c.method !== "GET"),
  ).toHaveLength(0);
});

test("cloud shift conflict blocks overwrites and keeps the unsaved draft", async ({
  page,
}) => {
  await mockBackend(page, true);
  const original = {
    id: crypto.randomUUID(),
    platform: "DoorDash",
    date: "2026-01-02",
    time: "10:00",
    duration: 3,
    deliveries: 12,
    earnings: 80,
    note: "Old note",
    recognition: "Original recognition.",
  };
  await page.route(
    "https://fleet-test.supabase.co/rest/v1/shifts?**",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ data: original }]),
      }),
  );
  await page.route(
    "https://fleet-test.supabase.co/rest/v1/rpc/fleet_update_shift",
    (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          code: "P0001",
          message: "FLEET_SHIFT_CONFLICT",
        }),
      }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "My shifts", exact: true }).click();
  await page.locator("tbody tr").first().getByRole("button").first().click();
  await page.getByRole("button", { name: "Edit shift", exact: true }).click();
  await page.getByLabel("How was it, really?").fill("My unsaved draft");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator('.error-banner[role="alert"]')).toContainText(
    "has not overwritten",
  );
  await expect(page.getByLabel("How was it, really?")).toHaveValue(
    "My unsaved draft",
  );
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Reload workspace" }),
  ).toBeVisible();
});
