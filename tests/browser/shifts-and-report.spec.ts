import { test, expect } from "@playwright/test";
import { demoData, type Shift } from "../../lib/fleet";

test("a correction preserves the shift ID and note, survives reload, and updates recognition", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "My shifts", exact: true }).click();
  await page.locator("tbody tr").first().getByRole("button").first().click();
  await page.getByRole("button", { name: "Edit shift", exact: true }).click();
  await page
    .getByLabel("How was it, really?")
    .fill("Private note that should remain.");
  await page.getByRole("button", { name: "Save changes" }).click();
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem("fleet-demo-v1")!).shifts[0],
  );
  await page.getByRole("button", { name: "Edit shift", exact: true }).click();
  await expect(page.getByLabel("How was it, really?")).toHaveValue(
    "Private note that should remain.",
  );
  await page.getByLabel("Duration (hours)").fill("5");
  await page.getByLabel("Completed deliveries / rides").fill("22");
  await page.getByLabel("Earnings ($)").fill("123.45");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".recognition-detail")).toContainText("5 hours");
  await expect(
    page.getByText("Private note that should remain.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep moving" }).click();
  await page.reload();
  await page.getByRole("button", { name: "My shifts", exact: true }).click();
  await expect(page.getByRole("cell", { name: "$123.45" })).toBeVisible();
  const after = await page.evaluate(
    () => JSON.parse(localStorage.getItem("fleet-demo-v1")!).shifts,
  );
  expect(after).toHaveLength(8);
  expect(after.find((s: Shift) => s.id === before.id).note).toBe(before.note);
});
test("stale demo correction is blocked and keeps the draft visible", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "My shifts", exact: true }).click();
  await page.locator("tbody tr").first().getByRole("button").first().click();
  await page.getByRole("button", { name: "Edit shift", exact: true }).click();
  await page.getByLabel("Duration (hours)").fill("5");
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("fleet-demo-v1")!);
    data.shifts[0].note = "A newer correction from elsewhere";
    localStorage.setItem("fleet-demo-v1", JSON.stringify(data));
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator('.error-banner[role="alert"]')).toContainText(
    "changed or was deleted elsewhere",
  );
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Duration (hours)")).toHaveValue("5");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("fleet-demo-v1")!).shifts[0].note,
    ),
  ).toBe("A newer correction from elsewhere");
});
test("history supports pagination, inclusive date ranges, search, sorting, and clear filters", async ({
  page,
}) => {
  const data = demoData();
  data.shifts = Array.from({ length: 23 }, (_, i) => ({
    ...data.shifts[0],
    id: crypto.randomUUID(),
    date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    platform: i % 2 ? "Uber Eats" : "DoorDash",
    earnings: i * 10,
    note: "PRIVATE-SENTINEL",
  }));
  await page.addInitScript(
    (value) => localStorage.setItem("fleet-demo-v1", JSON.stringify(value)),
    data,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "My shifts", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await page.getByRole("button", { name: "Next shifts page" }).click();
  await page.getByRole("button", { name: "Next shifts page" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await expect(
    page.getByRole("navigation", { name: "Shift history pages" }),
  ).toContainText("21–23 of 23");
  await page.getByLabel("From date").fill("2026-01-03");
  await page.getByLabel("To date").fill("2026-01-05");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page.getByLabel("Filter shifts by platform").selectOption("DoorDash");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByLabel("Sort shifts").selectOption("earnings");
  await expect(page.locator("tbody tr").first()).toContainText("$40.00");
  await page.getByLabel("Search shifts").fill("PRIVATE-SENTINEL");
  await expect(
    page.getByRole("heading", { name: "No shifts match these filters." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await page.getByLabel("From date").fill("2026-02-01");
  await page.getByLabel("To date").fill("2026-01-01");
  await expect(page.locator('.error-banner[role="alert"]')).toContainText(
    "on or before",
  );
});
test("printable reputation only prints selected public details and never a journal note", async ({
  page,
}) => {
  const data = demoData();
  data.shifts[0].note = "NEVER PRINT THIS NOTE";
  data.profile.bio = "OPTIONAL BIO";
  await page.addInitScript(
    (value) => localStorage.setItem("fleet-demo-v1", JSON.stringify(value)),
    data,
  );
  await page.goto("/");
  await page.getByRole("button", { name: /^Fleet Score/ }).click();
  await page.getByRole("button", { name: "Preview printable record" }).click();
  const sheet = page.getByRole("article", {
    name: "Portable reputation preview",
  });
  await expect(sheet).toContainText("Alex Morgan");
  await expect(sheet).toContainText("DEMO WORKSPACE");
  await expect(sheet).not.toContainText("NEVER PRINT THIS NOTE");
  await expect(sheet).not.toContainText("OPTIONAL BIO");
  await expect(sheet.locator(".sheet-history")).toHaveCount(0);
  await page.getByLabel("Include recent shift history").check();
  await page.getByLabel("Include reported earnings").check();
  await page.getByLabel("Include my bio").check();
  await expect(sheet.locator(".sheet-history tbody tr")).toHaveCount(8);
  await expect(sheet).toContainText("OPTIONAL BIO");
  await expect(sheet).not.toContainText("NEVER PRINT THIS NOTE");
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printInvoked = "yes";
    };
  });
  await page.getByRole("button", { name: "Print / save PDF" }).click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-print-invoked",
    "yes",
  );
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".app-shell")).toBeHidden();
  await expect(sheet).toBeVisible();
  await expect(page.locator(".report-options")).toBeHidden();
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator("body")).not.toHaveClass(/record-preview-open/);
});
