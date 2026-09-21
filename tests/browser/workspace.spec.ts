import { test, expect } from "@playwright/test";

test("log, persist, filter, export, and delete a private shift", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good to see you, Alex." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log a shift", exact: true }).click();
  await page.getByLabel("Duration (hours)").fill("2.5");
  await page.getByLabel("Completed deliveries / rides").fill("9");
  await page.getByLabel("Earnings ($)").fill("65.25");
  await page
    .getByLabel("How was it, really?")
    .fill("Only I should see this note.");
  await page.getByRole("button", { name: "Save my shift" }).click();
  await expect(
    page.getByRole("heading", { name: "That work matters." }),
  ).toBeVisible();
  await expect(page.getByText("Only I should see this note.")).toBeVisible();
  await page.getByRole("button", { name: "Keep moving" }).click();
  await page.reload();
  await page.getByRole("button", { name: "My shifts", exact: true }).click();
  await expect(page.getByRole("cell", { name: "$65.25" })).toBeVisible();
  await page.getByLabel("Filter shifts by platform").selectOption("Uber Eats");
  await expect(page.getByRole("cell", { name: "$65.25" })).toHaveCount(0);
  await page.getByLabel("Filter shifts by platform").selectOption("DoorDash");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const record = JSON.parse(Buffer.concat(chunks).toString());
  expect(record.shifts).toHaveLength(9);
  expect(JSON.stringify(record)).not.toContain("Only I should see this note.");
  await page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "$65.25" }) })
    .getByRole("button")
    .first()
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete shift", exact: true }).click();
  await expect(page.getByRole("cell", { name: "$65.25" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("profile edits update the score and persist across reloads", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await page.getByLabel("Full name").fill("Sam Rivera");
  await page.getByLabel("On-time deliveries (%)").fill("100");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toContainText("Profile updated");
  await page
    .getByRole("button", { name: "Fleet Score", exact: false })
    .first()
    .click();
  await expect(page.locator(".big-score")).toContainText("948");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Good to see you, Sam." }),
  ).toBeVisible();
});

test("mobile navigation, dialog keyboard dismissal, and layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good to see you, Alex." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "My shifts", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The work you put in." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log a shift", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("production CSP has nonce protection with no unsafe-inline", async ({
  request,
}) => {
  const response = await request.get("/");
  const csp = response.headers()["content-security-policy"];
  expect(csp).toContain("'nonce-");
  expect(csp).not.toContain("unsafe-inline");
  expect(await response.text()).toMatch(/<script[^>]+nonce="[^"]+"/);
});
