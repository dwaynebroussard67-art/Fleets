import { test } from "node:test";
import assert from "node:assert/strict";
import {
  demoData,
  emptyProfile,
  fleetScore,
  localDate,
  portableRecord,
  profileSchema,
  recognitionFor,
  shiftSchema,
  weekData,
  type Shift,
} from "../lib/fleet";

const example = (): Shift => ({
  id: crypto.randomUUID(),
  date: localDate(),
  time: "10:00",
  platform: "DoorDash",
  duration: 3.5,
  deliveries: 12,
  earnings: 85.5,
  note: "PRIVATE NOTE",
  recognition: "",
});
test("empty score never invents missing reputation data", () => {
  const score = fleetScore(emptyProfile, []);
  assert.equal(score.total, 0);
  assert.equal(score.complete, false);
  assert.equal(score.components[0].value, null);
});
test("weighted maximum is exactly 1000 and experience/community are capped", () => {
  const score = fleetScore(
    {
      ...emptyProfile,
      reliability: 100,
      safety: 100,
      rating: 5,
      priorDeliveries: 100000,
      contributions: 1000,
    },
    [example()],
  );
  assert.equal(score.total, 1000);
  assert.ok(score.complete);
});
test("demo score uses the specified five weights", () => {
  const { profile, shifts } = demoData();
  assert.equal(fleetScore(profile, shifts).total, 943);
  assert.deepEqual(
    fleetScore(profile, shifts).components.map((c) => c.weight),
    [25, 20, 25, 15, 15],
  );
});
test("logging increases the experience component without changing other components", () => {
  const before = fleetScore(emptyProfile, []),
    after = fleetScore(emptyProfile, [example()]);
  assert.equal(after.components[4].value, 1.2);
  assert.equal(after.components[0].value, before.components[0].value);
});
test("recognition is factual and ignores private notes and earnings", () => {
  const shift = example();
  const text = recognitionFor(shift);
  assert.ok(text.includes("3.5 hours"));
  assert.ok(text.includes("12 deliveries"));
  assert.ok(!text.includes(shift.note));
  assert.ok(!text.includes("85.5"));
  assert.equal(
    recognitionFor({ ...shift, note: "changed", earnings: 200 }),
    text,
  );
});
test("recognition does not repeat across identical facts, even after the template pool", () => {
  const history: Shift[] = [];
  for (let i = 0; i < 50; i++) {
    const s = example();
    const text = recognitionFor(s, history);
    assert.ok(!history.some((s) => s.recognition === text));
    history.push({ ...s, recognition: text });
  }
});
test("ride platforms receive ride recognition; zero trips never creates deliveries", () => {
  assert.match(recognitionFor({ ...example(), platform: "Uber" }), /12 rides/);
  assert.match(
    recognitionFor({ ...example(), deliveries: 0 }),
    /completed a shift/,
  );
});
test("portable record excludes every private note", () => {
  const record = portableRecord(emptyProfile, [example()]);
  assert.ok(!("note" in record.shifts[0]));
  assert.ok(!JSON.stringify(record).includes("PRIVATE NOTE"));
  assert.match(record.evidence, /not verified/);
});
test("valid profile and shift parse successfully", () => {
  assert.ok(profileSchema.safeParse(emptyProfile).success);
  assert.ok(shiftSchema.safeParse(example()).success);
});
test("reject invalid financial, duration and trip values", () => {
  for (const changes of [
    { earnings: -1 },
    { duration: 0 },
    { duration: 25 },
    { deliveries: 1.5 },
    { deliveries: -1 },
    { earnings: NaN },
    { deliveries: 301 },
  ]) {
    assert.ok(
      !shiftSchema.safeParse({ ...example(), ...changes }).success,
      JSON.stringify(changes),
    );
  }
});
test("reject future and impossible dates and invalid times", () => {
  for (const date of ["2099-01-01", "2025-02-30", "2025-13-01", "junk"])
    assert.ok(!shiftSchema.safeParse({ ...example(), date }).success);
  for (const time of ["25:30", "12:75", "abc"])
    assert.ok(!shiftSchema.safeParse({ ...example(), time }).success);
});
test("reject unbounded profile inputs", () => {
  for (const changes of [
    { rating: 5.1 },
    { reliability: 101 },
    { safety: -1 },
    { contributions: 1.5 },
    { priorDeliveries: -1 },
    { name: " " },
    { bio: "x".repeat(501) },
  ])
    assert.ok(
      !profileSchema.safeParse({ ...emptyProfile, ...changes }).success,
    );
});
test("weekly buckets run Monday through Sunday, include only matching dates", () => {
  const data = weekData([example()]);
  assert.equal(data.length, 7);
  assert.equal(data[0].label, "Mon");
  assert.equal(data[6].label, "Sun");
  assert.equal(
    data.reduce((n, d) => n + d.hours, 0),
    3.5,
  );
  assert.equal(
    weekData([example()], -1).reduce((n, d) => n + d.hours, 0),
    0,
  );
});
