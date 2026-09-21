"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole, PencilLine } from "lucide-react";
import { ZodError } from "zod";
import Dialog from "./dialog";
import { localDate, platforms, type Shift } from "@/lib/fleet";
import {
  shiftDraftSchema,
  ShiftConflictError,
  type ShiftDraft,
} from "@/lib/shifts";

type Props = {
  original?: Shift;
  demo: boolean;
  close: () => void;
  save: (draft: ShiftDraft, original?: Shift) => Promise<void>;
};
export default function ShiftEditor({ original, demo, close, save }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || conflict) return;
    setError("");
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const draft = shiftDraftSchema.parse({
        platform: form.get("platform"),
        date: form.get("date"),
        time: form.get("time"),
        duration: Number(form.get("duration")),
        deliveries: Number(form.get("deliveries")),
        earnings: Number(form.get("earnings")),
        note: form.get("note"),
      });
      await save(draft, original);
    } catch (err) {
      setConflict(err instanceof ShiftConflictError);
      setError(
        err instanceof ZodError
          ? `Check ${err.issues[0].path.join(" ")}: ${err.issues[0].message}`
          : err instanceof Error
            ? err.message
            : "Unable to save this shift. Your draft is still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        original
          ? "Let’s get your record right."
          : "Another shift. Part of your story."
      }
      subtitle={
        original
          ? "Correct the details without starting over. Your shift keeps its identity."
          : "Take a minute to record the work you put in."
      }
      close={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={submit}>
        <fieldset className="plain-fieldset" disabled={busy}>
          {demo && (
            <div className="demo-notice">
              Demo mode · stored in this browser only. Don’t add sensitive
              information.
            </div>
          )}
          {original && (
            <div className="edit-note">
              <PencilLine size={16} />
              <p>
                Recognition updates when the platform, date, time, hours, or
                completed trips change. Editing earnings or your private note
                leaves it as it is.
              </p>
            </div>
          )}
          <div className="form-grid">
            <label className="full-width">
              Platform
              <select
                name="platform"
                defaultValue={original?.platform ?? platforms[0]}
              >
                {platforms.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input
                type="date"
                name="date"
                required
                max={localDate()}
                defaultValue={original?.date ?? localDate()}
              />
            </label>
            <label>
              Start time
              <input
                type="time"
                name="time"
                required
                defaultValue={original?.time ?? "09:00"}
              />
            </label>
            <label>
              Duration (hours)
              <input
                type="number"
                name="duration"
                min="0.25"
                max="24"
                step="any"
                required
                placeholder="e.g. 3.5"
                defaultValue={original?.duration}
              />
            </label>
            <label>
              Completed deliveries / rides
              <input
                type="number"
                name="deliveries"
                min="0"
                max="300"
                required
                placeholder="e.g. 12"
                defaultValue={original?.deliveries}
              />
            </label>
            <label className="full-width">
              Earnings ($){" "}
              <span className="optional">optional · before expenses</span>
              <input
                type="number"
                name="earnings"
                min="0"
                max="10000"
                step="any"
                placeholder="0.00"
                defaultValue={original?.earnings}
              />
            </label>
            <label className="full-width">
              How was it, really?{" "}
              <span className="optional">optional · private</span>
              <textarea
                name="note"
                rows={3}
                maxLength={5000}
                defaultValue={original?.note ?? ""}
                placeholder="The good, the hard, or whatever’s on your mind. This part is just for you."
              />
            </label>
          </div>
          <div className="privacy-hint">
            <LockKeyhole size={14} />
            <span>
              Your note stays out of portable records and recognition. Clearing
              this field and saving removes the note from this shift’s live
              record.
            </span>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          {conflict && (
            <button
              type="button"
              className="button secondary full-button"
              onClick={() => {
                if (
                  window.confirm(
                    "Reload and discard this unsaved draft to see the latest record?",
                  )
                )
                  window.location.reload();
              }}
            >
              Reload workspace
            </button>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="button ghost"
              disabled={busy}
              onClick={close}
            >
              Cancel
            </button>
            <button className="button primary" disabled={busy || conflict}>
              {busy
                ? "Saving your shift…"
                : original
                  ? "Save changes"
                  : "Save my shift"}
              <ArrowRight size={17} />
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
