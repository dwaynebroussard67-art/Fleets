import { z } from "zod";
import { shiftSchema, recognitionFor, type Shift } from "./fleet";
import { shiftKey } from "./records";

export const shiftDraftSchema = shiftSchema.omit({
  id: true,
  recognition: true,
});
export type ShiftDraft = z.infer<typeof shiftDraftSchema>;
export class ShiftConflictError extends Error {
  constructor() {
    super(
      "This shift changed or was deleted elsewhere. Your draft has not overwritten it. Reload the workspace to review the latest record before editing again.",
    );
    this.name = "ShiftConflictError";
  }
}
const factFields = [
  "platform",
  "date",
  "time",
  "duration",
  "deliveries",
] as const;
export function prepareShift(
  draft: ShiftDraft,
  existing: Shift[],
  original?: Shift,
): Shift {
  const valid = shiftDraftSchema.parse(draft);
  if (
    existing.some(
      (s) => s.id !== original?.id && shiftKey(s) === shiftKey(valid),
    )
  )
    throw new Error(
      "There’s already a shift for this platform at that date and time.",
    );
  const base = { ...valid, id: original?.id ?? crypto.randomUUID() };
  const factsChanged =
    !original || factFields.some((key) => original[key] !== valid[key]);
  return {
    ...base,
    recognition: factsChanged
      ? recognitionFor(
          base,
          existing.filter((s) => s.id !== original?.id),
        )
      : original.recognition,
  };
}
export function sameShift(a: Shift | undefined, b: Shift) {
  if (!a) return false;
  return (Object.keys(shiftSchema.shape) as (keyof Shift)[]).every(
    (key) => a[key] === b[key],
  );
}
export type ShiftOrder = "newest" | "oldest" | "earnings" | "duration";
export type ShiftFilters = {
  query: string;
  platform: string;
  from: string;
  to: string;
  order: ShiftOrder;
};
export const emptyFilters: ShiftFilters = {
  query: "",
  platform: "All platforms",
  from: "",
  to: "",
  order: "newest",
};
export function filterShifts(shifts: Shift[], filter: ShiftFilters) {
  if (filter.from && filter.to && filter.from > filter.to) return [];
  const words = filter.query
    .trim()
    .toLocaleLowerCase("en-US")
    .split(/\s+/)
    .filter(Boolean);
  const dateFormatter = words.length
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;
  return shifts
    .filter((s) => {
      if (filter.platform !== "All platforms" && s.platform !== filter.platform)
        return false;
      if (
        (filter.from && s.date < filter.from) ||
        (filter.to && s.date > filter.to)
      )
        return false;
      if (!words.length) return true;
      // Notes and recognition never enter the search index or filter summaries.
      const date = dateFormatter!.format(new Date(s.date + "T12:00:00"));
      const searchable =
        `${s.platform} ${s.date} ${s.time} ${date}`.toLocaleLowerCase("en-US");
      return words.every((word) => searchable.includes(word));
    })
    .sort((a, b) => {
      const chronological = (a.date + a.time).localeCompare(b.date + b.time);
      const tie = a.id.localeCompare(b.id);
      if (filter.order === "oldest") return chronological || tie;
      if (filter.order === "earnings")
        return b.earnings - a.earnings || -chronological || tie;
      if (filter.order === "duration")
        return b.duration - a.duration || -chronological || tie;
      return -chronological || tie;
    });
}
export function shiftTotals(shifts: Shift[]) {
  const totals = shifts.reduce(
    (acc, s) => ({
      count: acc.count + 1,
      hours: acc.hours + s.duration,
      trips: acc.trips + s.deliveries,
      earnings: acc.earnings + s.earnings,
    }),
    { count: 0, hours: 0, trips: 0, earnings: 0 },
  );
  return {
    ...totals,
    hours: Math.round(totals.hours * 100) / 100,
    earnings: Math.round(totals.earnings * 100) / 100,
  };
}
