import { test } from "node:test";
import assert from "node:assert/strict";
import { demoData, emptyProfile, fleetScore, type Shift } from "../lib/fleet";
import {
  prepareShift,
  sameShift,
  filterShifts,
  emptyFilters,
  shiftTotals,
  ShiftConflictError,
} from "../lib/shifts";
import { DEMO_STORAGE_KEY, readDemo, saveDemoShift } from "../lib/demo-store";
import {
  reputationReport,
  defaultReportOptions,
} from "../lib/reputation-report";
const example = (): Shift => ({
  id: crypto.randomUUID(),
  date: "2026-01-02",
  time: "10:00",
  platform: "DoorDash",
  duration: 3,
  deliveries: 12,
  earnings: 86.5,
  note: "PRIVATE JOURNAL",
  recognition: "Your original recognition.",
});
function memoryStore(value: string) {
  let raw = value;
  return {
    getItem: () => raw,
    setItem: (_key: string, next: string) => {
      raw = next;
    },
  };
}
test("corrections retain identity and notes while recomputing recognition from changed facts", () => {
  const original = example();
  const edited = prepareShift(
    { ...original, duration: 4, deliveries: 20 },
    [original],
    original,
  );
  assert.equal(edited.id, original.id);
  assert.equal(edited.note, original.note);
  assert.match(edited.recognition, /4 hours/);
  assert.match(edited.recognition, /20 deliveries/);
  assert.notEqual(
    fleetScore(emptyProfile, [edited]).total,
    fleetScore(emptyProfile, [original]).total,
  );
  assert.equal(original.duration, 3);
});
test("earnings/note-only corrections preserve recognition, and notes can be deliberately cleared", () => {
  const original = example();
  const edited = prepareShift(
    { ...original, earnings: 120, note: "" },
    [original],
    original,
  );
  assert.equal(edited.recognition, original.recognition);
  assert.equal(edited.note, "");
  assert.equal(edited.earnings, 120);
});
test("duplicate corrections are rejected but an unchanged original is not its own duplicate", () => {
  const original = example();
  const other = { ...example(), time: "11:00" };
  assert.throws(
    () =>
      prepareShift({ ...original, time: "11:00" }, [original, other], original),
    /already a shift/,
  );
  assert.ok(sameShift(prepareShift(original, [original], original), original));
  assert.equal(sameShift(undefined, original), false);
});
test("demo correction merges fresh unrelated records and profile rather than overwriting stale state", () => {
  const original = example();
  const other = { ...example(), time: "12:00" };
  const profile = { ...emptyProfile, name: "Updated in another tab" };
  const store = memoryStore(
    JSON.stringify({ profile, shifts: [original, other] }),
  );
  const saved = saveDemoShift(store, { ...original, duration: 4 }, original);
  assert.equal(saved.workspace.shifts.length, 2);
  assert.deepEqual(saved.workspace.profile, profile);
  assert.equal(
    readDemo(store).shifts.find((s) => s.id === other.id)?.note,
    other.note,
  );
});
test("stale and deleted demo edits fail without modifying storage", () => {
  const original = example();
  for (const shifts of [[{ ...original, note: "A newer note" }], []]) {
    const raw = JSON.stringify({ profile: emptyProfile, shifts });
    const store = memoryStore(raw);
    assert.throws(
      () => saveDemoShift(store, { ...original, duration: 4 }, original),
      ShiftConflictError,
    );
    assert.equal(store.getItem(), raw);
  }
});
test("unavailable browser storage never reports a demo save as successful", () => {
  const original = example(),
    raw = JSON.stringify({ profile: emptyProfile, shifts: [original] });
  const store = {
    getItem: () => raw,
    setItem: () => {
      throw new Error("Quota exceeded");
    },
  };
  assert.throws(
    () => saveDemoShift(store, { ...original, duration: 4 }, original),
    /not saved/,
  );
  assert.equal(store.getItem(), raw);
  assert.throws(
    () => readDemo(memoryStore("bad-json")),
    /No saved data was changed/,
  );
  assert.equal(DEMO_STORAGE_KEY, "fleet-demo-v1");
});
test("history filtering is inclusive, combines search terms, and never searches private text", () => {
  const shifts = [
    example(),
    { ...example(), date: "2026-01-03", platform: "Uber Eats" as const },
    { ...example(), date: "2026-01-04" },
  ];
  assert.equal(
    filterShifts(shifts, {
      ...emptyFilters,
      from: "2026-01-02",
      to: "2026-01-03",
    }).length,
    2,
  );
  assert.equal(
    filterShifts(shifts, { ...emptyFilters, query: "door january" }).length,
    2,
  );
  assert.equal(
    filterShifts(shifts, { ...emptyFilters, query: "PRIVATE JOURNAL" }).length,
    0,
  );
  assert.equal(
    filterShifts(shifts, { ...emptyFilters, query: "original recognition" })
      .length,
    0,
  );
  assert.equal(
    filterShifts(shifts, {
      ...emptyFilters,
      from: "2026-01-04",
      to: "2026-01-03",
    }).length,
    0,
  );
});
test("sort order is deterministic and filters do not mutate the saved shift array", () => {
  const shifts = [
    example(),
    { ...example(), date: "2026-01-03", earnings: 2, duration: 1 },
  ];
  const copy = structuredClone(shifts);
  assert.equal(filterShifts(shifts, emptyFilters)[0].date, "2026-01-03");
  assert.equal(
    filterShifts(shifts, { ...emptyFilters, order: "oldest" })[0].date,
    "2026-01-02",
  );
  assert.equal(
    filterShifts(shifts, { ...emptyFilters, order: "earnings" })[0].earnings,
    86.5,
  );
  assert.equal(
    filterShifts(shifts, { ...emptyFilters, order: "duration" })[0].duration,
    3,
  );
  assert.deepEqual(shifts, copy);
  assert.deepEqual(shiftTotals(shifts), {
    count: 2,
    hours: 4,
    trips: 24,
    earnings: 88.5,
  });
});
test("printable report excludes journal text and all unselected details from its view model", () => {
  const original = example();
  const report = reputationReport({ ...emptyProfile, bio: "PRIVATE BIO" }, [
    original,
  ]);
  assert.ok(!JSON.stringify(report).includes(original.note));
  assert.ok(!JSON.stringify(report).includes(original.recognition));
  assert.ok(!("earnings" in report.totals));
  assert.ok(!("history" in report));
  assert.ok(!("bio" in report.driver));
  assert.match(report.evidence, /not a background check/);
  assert.equal(report.score.complete, false);
});
test("printable opt-ins are explicit, recent history is capped at ten, and demo status is retained", () => {
  const { profile } = demoData();
  const shifts = Array.from({ length: 15 }, (_, i) => ({
    ...example(),
    date: `2026-01-${String(i + 1).padStart(2, "0")}`,
  }));
  const report = reputationReport(
    profile,
    shifts,
    { includeEarnings: true, includeBio: true, includeHistory: true },
    true,
  );
  assert.equal(report.demo, true);
  assert.equal(report.history?.length, 10);
  assert.equal(report.totals.shifts, 15);
  assert.equal(report.history?.[0].date, "2026-01-15");
  assert.equal(report.driver.bio, profile.bio);
  assert.equal(report.totals.earnings, 1297.5);
  assert.ok(!JSON.stringify(report).includes("PRIVATE JOURNAL"));
  assert.ok(!JSON.stringify(report).includes("original recognition"));
  assert.equal(
    reputationReport(emptyProfile, [], defaultReportOptions).period,
    null,
  );
});
