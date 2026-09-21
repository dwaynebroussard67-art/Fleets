import { test, expect, type Download } from "@playwright/test";
import { demoData } from "../../lib/fleet";

async function readDownload(download: Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const part of stream!) chunks.push(part);
  return Buffer.concat(chunks);
}
test("private backup is opt-in and restores profile, shifts, and notes after a blank reset", async ({
  page,
}) => {
  const data = demoData();
  data.shifts[0].note = "My private test journal.";
  await page.addInitScript(
    (value) => localStorage.setItem("fleet-demo-v1", JSON.stringify(value)),
    data,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await page.getByRole("button", { name: "Download a copy" }).click();
  const [publicDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download portable record" }).click(),
  ]);
  expect((await readDownload(publicDownload)).toString()).not.toContain(
    "My private test journal.",
  );
  await page.getByRole("button", { name: "Download a copy" }).click();
  await page.getByLabel("Include my private journal notes").check();
  const [privateDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download private backup" }).click(),
  ]);
  const backup = await readDownload(privateDownload);
  expect(backup.toString()).toContain("My private test journal.");
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByLabel("Start with an empty workspace").check();
  await expect(
    page.getByRole("button", { name: "Reset demo workspace" }),
  ).toBeDisabled();
  await page.getByLabel("Type RESET to confirm").fill("RESET");
  await page.getByRole("button", { name: "Reset demo workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Good to see you, Driver." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await page.getByRole("button", { name: "Import a record" }).click();
  await page.getByLabel("Fleet JSON file").setInputFiles({
    name: "fleet-private-backup.json",
    mimeType: "application/json",
    buffer: backup,
  });
  await expect(page.locator(".import-counts")).toContainText("8 new shifts");
  await page.getByLabel("Also restore the profile").check();
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByLabel("Full name")).toHaveValue("Alex Morgan");
  await page.getByRole("button", { name: "My shifts", exact: true }).click();
  await page.locator("tbody tr").first().getByRole("button").first().click();
  await expect(page.getByText("My private test journal.")).toBeVisible();
  await page.getByRole("button", { name: "Keep moving" }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fleet-demo-v1")!),
  );
  expect(saved.shifts).toHaveLength(8);
  expect(
    saved.shifts.find(
      (s: { note: string }) => s.note === "My private test journal.",
    ),
  ).toBeTruthy();
});
test("invalid imports preserve data; duplicate imports cannot overwrite existing notes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  const original = await page.evaluate(() =>
    localStorage.getItem("fleet-demo-v1"),
  );
  await page.getByRole("button", { name: "Import a record" }).click();
  await page.getByLabel("Fleet JSON file").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("not json"),
  });
  await expect(page.locator('.error-banner[role="alert"]')).toContainText(
    "not a valid JSON",
  );
  await expect(
    page.getByRole("button", { name: "Confirm import" }),
  ).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem("fleet-demo-v1"))).toBe(
    original,
  );
  const parsed = JSON.parse(original!);
  const record = {
    version: 1,
    source: "FLEET",
    kind: "private-backup",
    ...parsed,
  };
  record.shifts[0].note = "Do not overwrite";
  await page.getByLabel("Fleet JSON file").setInputFiles({
    name: "duplicate.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(record)),
  });
  await expect(page.locator(".import-counts")).toContainText("0 new shifts");
  await expect(page.locator(".import-counts")).toContainText(
    "8 already recorded",
  );
  await expect(
    page.getByRole("button", { name: "Confirm import" }),
  ).toBeDisabled();
  await page.getByLabel("Also restore the profile").check();
  await page.getByRole("button", { name: "Confirm import" }).click();
  expect(await page.evaluate(() => localStorage.getItem("fleet-demo-v1"))).toBe(
    original,
  );
});
test("recovery route explains demo limitations without pretending to send email", async ({
  page,
}) => {
  await page.goto("/reset-password");
  await expect(
    page.getByText(
      "Password recovery is available after Fleet is connected to Supabase.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send reset link" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Back to Fleet" }).click();
  await expect(
    page.getByRole("heading", { name: "Good to see you, Alex." }),
  ).toBeVisible();
});
