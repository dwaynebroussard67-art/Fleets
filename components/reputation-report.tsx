"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownToLine,
  LockKeyhole,
  Printer,
  ShieldCheck,
} from "lucide-react";
import Dialog from "./dialog";
import { type Profile, type Shift } from "@/lib/fleet";
import {
  defaultReportOptions,
  reputationReport,
} from "@/lib/reputation-report";

type Props = {
  profile: Profile;
  shifts: Shift[];
  demo: boolean;
  close: () => void;
  exportRecord: () => void;
};
const date = (s: string) =>
  new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
export default function ReputationReport({
  profile,
  shifts,
  demo,
  close,
  exportRecord,
}: Props) {
  const [options, setOptions] = useState(defaultReportOptions);
  useEffect(() => {
    document.body.classList.add("record-preview-open");
    return () => document.body.classList.remove("record-preview-open");
  }, []);
  const report = reputationReport(profile, shifts, options, demo);
  return createPortal(
    <div className="report-root">
      <Dialog
        className="record-dialog"
        title="A record you can take with you."
        subtitle="Preview exactly what’s included, then print or choose Save as PDF in your browser’s print dialog."
        close={close}
      >
        <div className="report-options screen-only">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={options.includeHistory}
              onChange={(e) =>
                setOptions((o) => ({ ...o, includeHistory: e.target.checked }))
              }
            />
            <span>Include recent shift history</span>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={options.includeEarnings}
              onChange={(e) =>
                setOptions((o) => ({ ...o, includeEarnings: e.target.checked }))
              }
            />
            <span>Include reported earnings</span>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={options.includeBio}
              onChange={(e) =>
                setOptions((o) => ({ ...o, includeBio: e.target.checked }))
              }
            />
            <span>Include my bio</span>
          </label>
        </div>
        <div className="report-privacy screen-only">
          <LockKeyhole size={15} />
          <p>
            Journal notes are never included. No public profile or sharing link
            is created. Preview your selections before sharing a saved copy.
          </p>
        </div>
        <article
          className="reputation-sheet"
          aria-label="Portable reputation preview"
        >
          <header className="sheet-header">
            <div className="brand">
              <span className="brand-mark">
                <i />
                <i />
                <i />
              </span>
              FLEET
            </div>
            <div>
              <strong>PORTABLE DRIVER RECORD</strong>
              <span>
                Prepared{" "}
                {new Date(report.generatedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          </header>
          {demo && (
            <div className="sheet-demo">
              DEMO WORKSPACE · SAMPLE / BROWSER-LOCAL DATA · NOT A VERIFIED
              CREDENTIAL
            </div>
          )}
          <section className="sheet-intro">
            <div>
              <div className="eyebrow">INDEPENDENT, TOGETHER.</div>
              <h2>{report.driver.name}</h2>
              {report.driver.city && <p>{report.driver.city}</p>}
              {report.driver.bio && (
                <p className="sheet-bio">{report.driver.bio}</p>
              )}
            </div>
            <div className="sheet-score">
              <ShieldCheck size={25} />
              <strong>
                {report.score.total}
                <span>/ 1,000</span>
              </strong>
              <span>Self-reported Fleet Score</span>
              {!report.score.complete && (
                <small>Incomplete inputs · unknown values count as zero</small>
              )}
            </div>
          </section>
          <p className="sheet-disclaimer">{report.evidence}</p>
          <section className="sheet-activity">
            <h3>Work recorded in Fleet</h3>
            <div className="sheet-stats">
              <div>
                <strong>{report.totals.shifts}</strong>
                <span>Shifts logged</span>
              </div>
              <div>
                <strong>{report.totals.hours}</strong>
                <span>Hours recorded</span>
              </div>
              <div>
                <strong>{report.totals.trips}</strong>
                <span>Completed trips</span>
              </div>
              {report.totals.earnings !== undefined && (
                <div>
                  <strong>{money(report.totals.earnings)}</strong>
                  <span>Earnings before expenses</span>
                </div>
              )}
            </div>
            <p>
              {report.period
                ? `${date(report.period.from)} – ${date(report.period.to)}. Counts above exclude deliveries reported before joining Fleet.`
                : "No shifts recorded yet. Reputation inputs may still include work reported before joining Fleet."}
            </p>
          </section>
          <section className="sheet-components">
            <h3>A transparent calculation</h3>
            <table>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Weight</th>
                  <th>Reported / normalized value</th>
                </tr>
              </thead>
              <tbody>
                {report.score.components.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td>{c.weight}%</td>
                    <td>
                      {c.value === null
                        ? "Not provided"
                        : `${Math.round(c.value * 10) / 10} / 100`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Score = weighted component sum × 10, rounded. Rating is normalized
              from five stars. Community reaches full credit at 20 reported
              instances of helping another driver; experience at 1,000 prior +
              Fleet-logged deliveries. Missing values earn zero. All inputs are
              self-reported.
            </p>
          </section>
          {report.history && (
            <section className="sheet-history">
              <h3>
                Recent shift history{" "}
                <span>
                  {report.history.length} of {shifts.length} recorded shifts
                </span>
              </h3>
              {report.history.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Date / start</th>
                      <th>Platform</th>
                      <th>Hours</th>
                      <th>Trips</th>
                      {options.includeEarnings && <th>Earnings</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {report.history.map((s, i) => (
                      <tr key={i}>
                        <td>
                          {date(s.date)}
                          <small>{s.time}</small>
                        </td>
                        <td>{s.platform}</td>
                        <td>{s.duration}</td>
                        <td>{s.deliveries}</td>
                        {s.earnings !== undefined && (
                          <td>{money(s.earnings)}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No shifts recorded.</p>
              )}
              <p>
                This preview shows up to ten recent shifts. The portable JSON
                export contains the complete shift record, without journal
                notes.
              </p>
            </section>
          )}
          <footer className="sheet-footer">
            <span>Your work. Your reputation.</span>
            <span>Driver-provided · FLEET score model v1</span>
          </footer>
        </article>
        <div className="report-actions screen-only">
          <button className="button ghost" onClick={exportRecord}>
            <ArrowDownToLine size={16} />
            Full JSON record
          </button>
          <button className="button primary" onClick={() => window.print()}>
            <Printer size={16} />
            Print / save PDF
          </button>
        </div>
      </Dialog>
    </div>,
    document.body,
  );
}
