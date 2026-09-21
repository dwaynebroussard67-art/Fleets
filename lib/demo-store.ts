import { profileSchema, shiftSchema, type Profile, type Shift } from "./fleet";
import {
  prepareShift,
  sameShift,
  ShiftConflictError,
  type ShiftDraft,
} from "./shifts";
export const DEMO_STORAGE_KEY = "fleet-demo-v1";
type Store = Pick<Storage, "getItem" | "setItem">;
export type Workspace = { profile: Profile; shifts: Shift[] };
export function readDemo(store: Store): Workspace {
  try {
    const raw = store.getItem(DEMO_STORAGE_KEY);
    if (!raw) throw new Error("Missing workspace");
    const parsed = JSON.parse(raw);
    return {
      profile: profileSchema.parse(parsed.profile),
      shifts: shiftSchema.array().parse(parsed.shifts),
    };
  } catch {
    throw new Error(
      "The browser’s demo record is unavailable or has changed. Reload before saving. No saved data was changed.",
    );
  }
}
export function writeDemo(store: Store, workspace: Workspace) {
  try {
    store.setItem(DEMO_STORAGE_KEY, JSON.stringify(workspace));
  } catch {
    throw new Error(
      "Browser storage is full or disabled. Your changes were not saved. Free some space or download a backup before trying again.",
    );
  }
}
export function saveDemoShift(
  store: Store,
  draft: ShiftDraft,
  original?: Shift,
) {
  const current = readDemo(store);
  if (
    original &&
    !sameShift(
      current.shifts.find((s) => s.id === original.id),
      original,
    )
  )
    throw new ShiftConflictError();
  const shift = prepareShift(draft, current.shifts, original);
  const next = {
    profile: current.profile,
    shifts: [...current.shifts.filter((s) => s.id !== shift.id), shift].sort(
      (a, b) => (b.date + b.time).localeCompare(a.date + a.time),
    ),
  };
  writeDemo(store, next);
  return { workspace: next, shift };
}
