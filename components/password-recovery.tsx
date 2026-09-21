"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, LockKeyhole } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { requestPasswordReset, updatePassword } from "@/lib/auth";

export default function PasswordRecovery() {
  const [status, setStatus] = useState<
    "loading" | "request" | "update" | "done"
  >(supabase ? "loading" : "request");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!supabase) return;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const badLink = fragment.has("error") || query.has("error");
    if (badLink) {
      setStatus("request");
      setError(
        "This reset link is invalid or has expired. Request a new one below.",
      );
      window.history.replaceState(null, "", "/reset-password");
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "INITIAL_SESSION") {
        setStatus(session && !badLink ? "update" : "request");
      } else if (event === "SIGNED_OUT") setStatus("request");
    });
    return () => subscription.unsubscribe();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || busy) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (status === "update") {
        await updatePassword(
          supabase,
          String(form.get("password")),
          String(form.get("confirmation")),
        );
        setStatus("done");
      } else
        setMessage(
          await requestPasswordReset(
            supabase,
            String(form.get("email")),
            window.location.origin,
          ),
        );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="recovery-page">
      <Link href="/" className="brand">
        <span className="brand-mark">
          <i />
          <i />
          <i />
        </span>
        FLEET
      </Link>
      <section className="card recovery-card">
        <div className="dialog-mark">
          {status === "done" ? <Check size={24} /> : <LockKeyhole size={24} />}
        </div>
        <div className="eyebrow">BACK IN THE DRIVER’S SEAT</div>
        <h1>
          {status === "done"
            ? "A fresh start."
            : status === "update"
              ? "Choose a new password."
              : "Let’s get you back on the road."}
        </h1>
        <p className="muted">
          {status === "done"
            ? "Your password has been updated. You can use it the next time you sign in."
            : status === "update"
              ? "Choose a password you haven’t used before. Your shifts and reputation stay right where you left them."
              : supabase
                ? "We’ll email you a secure link to reset your password."
                : "Password recovery is available after Fleet is connected to Supabase. This preview is a browser-local demo."}
        </p>
        {status === "loading" ? (
          <p className="recovery-loading" role="status">
            Checking your secure link…
          </p>
        ) : status === "done" ? (
          <Link href="/" className="button primary full-button">
            Return to Fleet <ArrowRight size={16} />
          </Link>
        ) : supabase ? (
          <form onSubmit={submit}>
            <fieldset disabled={busy} className="plain-fieldset">
              <div className="form-grid">
                {status === "update" ? (
                  <>
                    <label className="full-width">
                      New password
                      <input
                        type="password"
                        name="password"
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={128}
                        required
                      />
                      <small className="muted">At least 8 characters.</small>
                    </label>
                    <label className="full-width">
                      Confirm new password
                      <input
                        type="password"
                        name="confirmation"
                        autoComplete="new-password"
                        required
                        maxLength={128}
                      />
                    </label>
                  </>
                ) : (
                  <label className="full-width">
                    Email address
                    <input
                      type="email"
                      name="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                    />
                  </label>
                )}
              </div>
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              )}
              {message && (
                <div className="success-banner" role="status">
                  {message}
                </div>
              )}
              <button className="button primary full-button">
                {busy
                  ? "One moment…"
                  : status === "update"
                    ? "Update password"
                    : "Send reset link"}
                <ArrowRight size={16} />
              </button>
            </fieldset>
          </form>
        ) : null}
        {status !== "done" && (
          <Link href="/" className="text-link recovery-back">
            <ArrowLeft size={15} /> Back to Fleet
          </Link>
        )}
        <p className="recovery-privacy">
          <LockKeyhole size={13} /> Never share a reset link or your password
          with anyone.
        </p>
      </section>
    </main>
  );
}
