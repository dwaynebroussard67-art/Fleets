import { test } from "node:test";
import assert from "node:assert/strict";
import { demoData, portableRecord, type Shift } from "../lib/fleet";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_SHIFTS,
  parseRecord,
  planImport,
  privateBackup,
} from "../lib/records";

test("portable record round trips without private notes or trusting supplied score", () => {
  const { profile, shifts } = demoData();
  shifts[0].note = "PRIVATE";
  const exported = portableRecord(profile, shifts);
  const parsed = parseRecord(
    JSON.stringify({ ...exported, score: { total: 999999 } }),
  );
  assert.deepEqual(parsed.profile, profile);
  assert.equal(parsed.shifts.length, 8);
  assert.ok(parsed.shifts.every((s) => s.note === ""));
  assert.equal(parsed.includesNotes, false);
  assert.ok(!("score" in parsed));
});
test("private backup round trips with notes, but injected notes in portable files are ignored", () => {
  const { profile, shifts } = demoData();
  shifts[0].note = "PRIVATE";
  const parsed = parseRecord(JSON.stringify(privateBackup(profile, shifts)));
  assert.equal(parsed.shifts[0].note, "PRIVATE");
  assert.ok(parsed.includesNotes);
  const portable = parseRecord(
    JSON.stringify({ version: 1, source: "FLEET", profile, shifts }),
  );
  assert.equal(portable.shifts[0].note, "");
});
test("import plan deduplicates logical shifts within file and against existing records", () => {
  const { profile, shifts } = demoData();
  shifts[0].note = "keep me";
  const existing = structuredClone(shifts);
  const newShift: Shift = {
    ...shifts[0],
    id: crypto.randomUUID(),
    time: "23:59",
    note: "new",
  };
  const record = {
    profile,
    shifts: [
      ...shifts,
      { ...shifts[0], note: "must not overwrite" },
      newShift,
      newShift,
    ],
    includesNotes: true,
  };
  const plan = planImport(record, shifts);
  assert.equal(plan.added.length, 1);
  assert.equal(plan.skipped, 10);
  assert.notEqual(plan.added[0].id, newShift.id);
  assert.equal(plan.added[0].note, "new");
  assert.deepEqual(shifts, existing);
  assert.equal(planImport(record, [...shifts, ...plan.added]).added.length, 0);
});
test("untrusted files are bounded, versioned, and fully validated before importing", () => {
  const { profile, shifts } = demoData();
  const record = privateBackup(profile, shifts);
  for (const raw of [
    { ...record, version: 2 },
    { ...record, source: "Other" },
    { ...record, shifts: [{ ...shifts[0], duration: -1 }] },
    { ...record, shifts: [{ ...shifts[0], note: null }] },
    { ...record, shifts: [], profile: { ...profile, rating: 7 } },
  ]) {
    assert.throws(
      () => parseRecord(JSON.stringify(raw)),
      /not a supported Fleet/,
    );
  }
  assert.throws(() => parseRecord("not json"), /valid JSON/);
  assert.throws(
    () => parseRecord(" ".repeat(MAX_IMPORT_BYTES + 1)),
    /too large/,
  );
  assert.throws(
    () =>
      parseRecord(
        JSON.stringify({
          ...record,
          shifts: Array.from(
            { length: MAX_IMPORT_SHIFTS + 1 },
            () => shifts[0],
          ),
        }),
      ),
    /5,000/,
  );
});
test("importing a portable record with colliding UUIDs never reuses another account’s ID", () => {
  const { profile, shifts } = demoData();
  const copied = { ...shifts[0], time: "00:30" };
  const plan = planImport(
    { profile, shifts: [copied], includesNotes: false },
    shifts,
  );
  assert.equal(plan.added.length, 1);
  assert.ok(shifts.every((s) => s.id !== plan.added[0].id));
});
