"use client";
import { useState, useMemo, type FormEvent, type ChangeEvent } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowDownToLine,
  ArrowRight,
  FileJson,
  KeyRound,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import Dialog from "./dialog";
import {
  localDate,
  portableRecord,
  shiftSchema,
  type Profile,
  type Shift,
} from "@/lib/fleet";
import {
  downloadJson,
  MAX_IMPORT_BYTES,
  parseRecord,
  planImport,
  privateBackup,
  type ImportRecord,
} from "@/lib/records";
import { loadAccountShifts, supabase } from "@/lib/supabase";
import { requestPasswordReset } from "@/lib/auth";

type Action = "backup" | "import" | "reset" | "delete" | null;
type Props = {
  profile: Profile;
  shifts: Shift[];
  user: User | null;
  onChanged: (profile: Profile, shifts: Shift[]) => void;
  onReset: (blank: boolean) => void;
  notify: (message: string) => void;
};
export default function AccountControls({
  profile,
  shifts,
  user,
  onChanged,
  onReset,
  notify,
}: Props) {
  const [action, setAction] = useState<Action>(null);
  const [busy, setBusy] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [record, setRecord] = useState<ImportRecord | null>(null);
  const [filename, setFilename] = useState("");
  const [replaceProfile, setReplaceProfile] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [blank, setBlank] = useState(false);
  function open(next: Action) {
    setError("");
    setNotice("");
    setRecord(null);
    setFilename("");
    setReplaceProfile(false);
    setIncludeNotes(false);
    setConfirmation("");
    setBlank(false);
    setNeedsReload(false);
    setAction(next);
  }
  function close() {
    if (!busy) {
      setAction(null);
      setError("");
    }
  }
  async function chooseFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setRecord(null);
    setError("");
    setReplaceProfile(false);
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > MAX_IMPORT_BYTES)
        throw new Error("Choose a Fleet JSON file under 5 MB.");
      const parsed = parseRecord(await file.text());
      setRecord(parsed);
      setFilename(file.name);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to read this file.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function importRecord(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!record || busy || needsReload) return;
    setBusy(true);
    setError("");
    let committed = false;
    try {
      let added: Shift[];
      let skipped: number;
      let all: Shift[];
      const nextProfile = replaceProfile ? record.profile : profile;
      if (user && supabase) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session || session.user.id !== user.id)
          throw new Error(
            "Your session changed. Reload before importing a record.",
          );
        const { data, error } = await supabase
          .rpc("fleet_import_record", {
            records: record.shifts,
            imported_profile: replaceProfile ? record.profile : null,
          })
          .setHeader("Authorization", `Bearer ${session.access_token}`);
        if (error)
          throw new Error(
            "We couldn’t confirm the import. Reload to check before retrying. Invalid records roll back the whole import, and retrying won’t duplicate shifts. Check your connection and that the account-controls database migration is installed.",
          );
        committed = true;
        added = shiftSchema.array().parse(data.added);
        skipped = data.skipped;
        // Re-read after commit, including duplicates from a lost-response retry
        // and records added by another device since this page first loaded.
        all = shiftSchema
          .array()
          .parse((await loadAccountShifts(user.id)).map((row) => row.data));
      } else {
        ({ added, skipped } = planImport(record, shifts));
        all = [...shifts, ...added];
      }
      all.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
      if (!user) {
        try {
          localStorage.setItem(
            "fleet-demo-v1",
            JSON.stringify({ profile: nextProfile, shifts: all }),
          );
        } catch {
          throw new Error(
            "There isn’t enough browser storage, or storage is disabled. Nothing was imported. Try a smaller file.",
          );
        }
      }
      onChanged(nextProfile, all);
      setAction(null);
      notify(
        `Imported ${added.length} ${added.length === 1 ? "shift" : "shifts"}. ${skipped} duplicate ${skipped === 1 ? "entry was" : "entries were"} left unchanged.${replaceProfile ? " Profile restored." : ""}`,
      );
    } catch (err) {
      if (committed) {
        setNeedsReload(true);
        setError(
          "Your import was saved, but we couldn’t refresh the workspace. Reload before making more changes. Your imported data is in your account.",
        );
      } else
        setError(
          err instanceof Error ? err.message : "Unable to import this record.",
        );
    } finally {
      setBusy(false);
    }
  }
  function exportBackup() {
    downloadJson(
      includeNotes
        ? privateBackup(profile, shifts)
        : portableRecord(profile, shifts),
      `fleet-${includeNotes ? "private-backup" : "record"}-${localDate()}.json`,
    );
    setAction(null);
    notify(
      includeNotes
        ? "Private backup downloaded. Keep it secure — it includes your journal notes."
        : "Portable record downloaded. Journal notes are excluded.",
    );
  }
  async function sendReset() {
    if (!user?.email || !supabase || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setNotice(
        await requestPasswordReset(
          supabase,
          user.email,
          window.location.origin,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to send reset link.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function removeAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      !user?.email ||
      !supabase ||
      busy ||
      confirmation !== "DELETE MY ACCOUNT"
    )
      return;
    const password = String(new FormData(e.currentTarget).get("password"));
    setBusy(true);
    setError("");
    try {
      const auth = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (auth.error || auth.data.user?.id !== user.id || !auth.data.session)
        throw new Error(
          "We couldn’t confirm your password. Your account has not been deleted.",
        );
      const { error } = await supabase
        .rpc("fleet_delete_my_account", {
          confirmation,
        })
        .setHeader("Authorization", `Bearer ${auth.data.session.access_token}`);
      if (error)
        throw new Error(
          "Your account could not be deleted. Check your connection and that the account-controls database migration is installed, then try again.",
        );
      // SIGNED_OUT switches to the independent demo dataset, never a cloud-data copy.
      const current = await supabase.auth.getSession();
      if (current.data.session?.user.id !== user.id) {
        notify(
          "Your account was deleted. The other active browser session was left unchanged.",
        );
        return;
      }
      const signedOut = await supabase.auth.signOut({ scope: "local" });
      if (signedOut.error) {
        setNotice(
          "Your account was deleted, but this browser could not finish signing out. Close this tab and clear Fleet site data before using this device again.",
        );
        setAction(null);
      } else
        notify(
          "Your account and its live Fleet records have been deleted. You’re now in the sample demo.",
        );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete account.",
      );
    } finally {
      setBusy(false);
    }
  }
  function resetDemo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirmation !== "RESET" || user) return;
    try {
      onReset(blank);
      setAction(null);
      notify(
        blank
          ? "Your demo is empty. Your next shift starts the story."
          : "Sample workspace restored. Previous demo data was cleared.",
      );
    } catch {
      setError("Browser storage is unavailable. The demo could not be reset.");
    }
  }
  const plan = useMemo(
    () => (record ? planImport(record, shifts) : null),
    [record, shifts],
  );
  return (
    <section
      className="card account-controls"
      aria-labelledby="account-controls-title"
    >
      <div className="account-controls-heading">
        <div>
          <div className="eyebrow">YOUR DATA. YOUR CALL.</div>
          <h2 id="account-controls-title">Ownership isn’t just a score.</h2>
          <p>
            Take your history with you, bring it back, or choose a fresh start.
          </p>
        </div>
        <ShieldCheck size={27} />
      </div>
      <div className="account-action-row">
        <span className="account-action-icon">
          <ArrowDownToLine size={20} />
        </span>
        <div>
          <h3>Keep a copy of your story</h3>
          <p>
            Export a portable record, or choose a private backup with journal
            notes.
          </p>
        </div>
        <button className="button ghost small" onClick={() => open("backup")}>
          Download a copy <ArrowDownToLine size={15} />
        </button>
      </div>
      <div className="account-action-row">
        <span className="account-action-icon">
          <Upload size={20} />
        </span>
        <div>
          <h3>Bring your record with you</h3>
          <p>
            Preview a Fleet JSON file before importing. Existing shifts are
            never overwritten.
          </p>
        </div>
        <button className="button ghost small" onClick={() => open("import")}>
          Import a record <Upload size={15} />
        </button>
      </div>
      {user ? (
        <>
          <div className="account-action-row">
            <span className="account-action-icon">
              <KeyRound size={20} />
            </span>
            <div>
              <h3>Account security</h3>
              <p>A password reset link will be sent to {user.email}.</p>
            </div>
            <button
              className="button ghost small"
              disabled={busy}
              onClick={sendReset}
            >
              {busy ? "Sending…" : "Send password reset"}
            </button>
          </div>
          <div className="account-action-row danger-row">
            <span className="account-action-icon">
              <Trash2 size={20} />
            </span>
            <div>
              <h3>Leave on your terms</h3>
              <p>
                Delete your account, profile, shifts, and notes from Fleet’s
                live database. This cannot be undone.
              </p>
            </div>
            <button
              className="button danger-outline small"
              onClick={() => open("delete")}
            >
              Delete account
            </button>
          </div>
        </>
      ) : (
        <div className="account-action-row">
          <span className="account-action-icon">
            <RotateCcw size={20} />
          </span>
          <div>
            <h3>A fresh start in the demo</h3>
            <p>
              Clear this browser’s demo changes. Real accounts are never
              affected.
            </p>
          </div>
          <button className="button ghost small" onClick={() => open("reset")}>
            Reset demo
          </button>
        </div>
      )}
      {!action && error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="success-banner" role="status">
          {notice}
        </div>
      )}
      <div className="account-privacy">
        <LockKeyhole size={15} />
        <p>
          {user
            ? "Account data is restricted to your account by database security rules. Authorized database operators can still access it; journal notes are not end-to-end encrypted."
            : "Demo data is saved in this browser, not in a private cloud account. Anyone using the same browser profile may be able to see it."}{" "}
          Downloaded files are not encrypted. Store them securely.
        </p>
      </div>
      {action === "backup" && (
        <Dialog
          title="Your work, to go."
          subtitle="Choose what you want in your downloadable JSON file."
          close={close}
        >
          <div className="backup-summary">
            <FileJson size={27} />
            <div>
              <strong>{shifts.length} shifts + your driver profile</strong>
              <p>Your Fleet Score is calculated again when you import.</p>
            </div>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={includeNotes}
              onChange={(e) => setIncludeNotes(e.target.checked)}
            />
            <span>
              Include my private journal notes
              <strong>For your own backup only. Not for sharing.</strong>
            </span>
          </label>
          <div className={includeNotes ? "demo-notice" : "privacy-hint"}>
            {includeNotes
              ? "This file will include your private thoughts in plain text. Anyone with the file can read them. Keep it somewhere secure."
              : "By default, journal notes stay out. Your profile, shift facts, recognition, and self-reported score are included."}
          </div>
          <div className="dialog-actions">
            <button className="button ghost" onClick={close}>
              Cancel
            </button>
            <button className="button primary" onClick={exportBackup}>
              <ArrowDownToLine size={16} />
              {includeNotes
                ? "Download private backup"
                : "Download portable record"}
            </button>
          </div>
        </Dialog>
      )}
      {action === "import" && (
        <Dialog
          title="Pick up where you left off."
          subtitle="Your current records stay safe. Preview first, then choose what to bring in."
          close={close}
        >
          <form onSubmit={importRecord}>
            <label className="file-picker">
              <Upload size={25} />
              <strong>Choose a Fleet record or backup</strong>
              <span>JSON · up to 5 MB · up to 5,000 shifts</span>
              <input
                aria-label="Fleet JSON file"
                type="file"
                accept=".json,application/json"
                disabled={busy}
                onChange={chooseFile}
              />
            </label>
            {record && plan && (
              <>
                <div className="import-preview">
                  <h3>{filename}</h3>
                  <div className="import-counts">
                    <span>
                      <strong>{plan.added.length}</strong> new shifts
                    </span>
                    <span>
                      <strong>{plan.skipped}</strong> already recorded
                    </span>
                  </div>
                  <p>
                    Same platform, date, and start time? That shift is left
                    untouched, including its private note. Scores from the file
                    are ignored and recalculated.
                  </p>
                  <p>
                    {record.includesNotes
                      ? "This is a private backup. Notes are restored only for newly added shifts."
                      : "This portable record does not restore journal notes."}
                  </p>
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={replaceProfile}
                    onChange={(e) => setReplaceProfile(e.target.checked)}
                    disabled={busy}
                  />
                  <span>
                    Also restore the profile for {record.profile.name}
                    <strong>
                      Replaces your name, city, bio, and all self-reported score
                      inputs. Leave off to keep your current profile.
                    </strong>
                  </span>
                </label>
                {!user && (
                  <div className="demo-notice">
                    This imports into the browser-local demo, not a private
                    cloud account. Don’t import sensitive notes on a shared
                    device.
                  </div>
                )}
              </>
            )}
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            {needsReload && (
              <button
                type="button"
                className="button secondary full-button"
                onClick={() => window.location.reload()}
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
              <button
                className="button primary"
                disabled={
                  busy ||
                  needsReload ||
                  !record ||
                  (!plan?.added.length && !replaceProfile)
                }
              >
                {busy ? "Importing…" : "Confirm import"}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {action === "reset" && (
        <Dialog
          title="A clean slate, just here."
          subtitle="This only changes the demo in this browser. Download a copy first if you want to keep anything."
          close={close}
        >
          <form onSubmit={resetDemo}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={blank}
                onChange={(e) => setBlank(e.target.checked)}
              />
              <span>
                Start with an empty workspace
                <strong>
                  Leave unchecked to restore Alex’s sample profile and eight
                  sample shifts.
                </strong>
              </span>
            </label>
            <div className="form-grid">
              <label className="full-width">
                Type RESET to confirm
                <input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                  required
                />
              </label>
            </div>
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            <div className="dialog-actions">
              <button type="button" className="button ghost" onClick={close}>
                Keep my demo
              </button>
              <button
                className="button primary"
                disabled={confirmation !== "RESET"}
              >
                Reset demo workspace
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {action === "delete" && (
        <Dialog
          title="Your choice. A permanent goodbye."
          subtitle="Download a copy before continuing. There is no undo."
          close={close}
        >
          <div className="demo-notice">
            Your account, profile, shifts, recognition, and journal notes will
            be removed from the live database. Previously downloaded files and
            operator backups aren’t erased by this action.
          </div>
          <form onSubmit={removeAccount}>
            <fieldset className="plain-fieldset" disabled={busy}>
              <div className="form-grid">
                <label className="full-width">
                  Current password
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={128}
                  />
                </label>
                <label className="full-width">
                  Type DELETE MY ACCOUNT to confirm
                  <input
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    autoComplete="off"
                    required
                  />
                </label>
              </div>
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              )}
              <div className="dialog-actions">
                <button type="button" className="button ghost" onClick={close}>
                  Keep my account
                </button>
                <button
                  className="button danger"
                  disabled={busy || confirmation !== "DELETE MY ACCOUNT"}
                >
                  {busy
                    ? "Confirming and deleting…"
                    : "Permanently delete account"}
                </button>
              </div>
            </fieldset>
          </form>
        </Dialog>
      )}
    </section>
  );
}
