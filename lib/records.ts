import { z } from "zod";
import { profileSchema, shiftSchema, type Profile, type Shift } from "./fleet";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_SHIFTS = 5000;
const common = {
  version: z.literal(1),
  source: z.literal("FLEET"),
  profile: profileSchema,
};
const portableSchema = z.object({
  ...common,
  kind: z.literal("portable-record").optional(), // v1 exports did not have a kind.
  shifts: shiftSchema.omit({ note: true }).array().max(MAX_IMPORT_SHIFTS),
});
const backupSchema = z.object({
  ...common,
  kind: z.literal("private-backup"),
  shifts: shiftSchema.array().max(MAX_IMPORT_SHIFTS),
});
export type ImportRecord = {
  profile: Profile;
  shifts: Shift[];
  includesNotes: boolean;
};
export function parseRecord(text: string): ImportRecord {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES)
    throw new Error(
      "This file is too large. Choose a Fleet JSON file under 5 MB.",
    );
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(
      "This is not a valid JSON file. Choose a record exported by Fleet.",
    );
  }
  const backup = backupSchema.safeParse(raw);
  if (backup.success)
    return {
      profile: backup.data.profile,
      shifts: backup.data.shifts,
      includesNotes: true,
    };
  const portable = portableSchema.safeParse(raw);
  if (!portable.success)
    throw new Error(
      "This file is not a supported Fleet v1 record, or contains invalid shift data. Nothing has been imported. Limit: 5,000 shifts per file.",
    );
  return {
    profile: portable.data.profile,
    shifts: portable.data.shifts.map((s) => ({ ...s, note: "" })),
    includesNotes: false,
  };
}
export function shiftKey(s: Pick<Shift, "date" | "time" | "platform">) {
  return `${s.date}|${s.time}|${s.platform}`;
}
export function planImport(record: ImportRecord, existing: Shift[]) {
  const known = new Set(existing.map(shiftKey));
  const added: Shift[] = [];
  let skipped = 0;
  for (const shift of record.shifts) {
    const key = shiftKey(shift);
    if (known.has(key)) {
      skipped++;
      continue;
    }
    known.add(key);
    // A portable record's IDs may belong to a different cloud account.
    // Re-key new records; the platform/date/time key keeps retries idempotent.
    added.push({ ...shift, id: crypto.randomUUID() });
  }
  return { added, skipped };
}
export function privateBackup(profile: Profile, shifts: Shift[]) {
  return {
    version: 1,
    source: "FLEET",
    kind: "private-backup",
    exportedAt: new Date().toISOString(),
    profile,
    shifts,
  };
}
export function downloadJson(record: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
