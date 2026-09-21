"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Award,
  Carrot,
  PencilLine,
  Printer,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  Heart,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  Plus,
  Route,
  Settings2,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import ShiftEditor from "@/components/shift-editor";
import ShiftHistory from "@/components/shift-history";
import ReputationReport from "@/components/reputation-report";
import {
  prepareShift,
  ShiftConflictError,
  type ShiftDraft,
} from "@/lib/shifts";
import { readDemo, writeDemo, saveDemoShift } from "@/lib/demo-store";
import Dialog from "@/components/dialog";
import AccountControls from "@/components/account-controls";
import { requestPasswordReset } from "@/lib/auth";
import type { User } from "@supabase/supabase-js";
import {
  demoData,
  emptyProfile,
  fleetScore,
  localDate,
  portableRecord,
  profileSchema,
  shiftSchema,
  weekData,
  type Profile,
  type Shift,
} from "@/lib/fleet";
import { loadAccountShifts, supabase } from "@/lib/supabase";

type Page = "Overview" | "My shifts" | "Fleet Score" | "My profile";
type Modal = "shift" | "edit-shift" | "report" | "auth" | "about" | null;
const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const dateLabel = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year:
      Number(date.slice(0, 4)) !== new Date().getFullYear()
        ? "numeric"
        : undefined,
  });
const icons = {
  Overview: LayoutDashboard,
  "My shifts": Route,
  "Fleet Score": ShieldCheck,
  "My profile": Users,
};
const STORAGE_KEY = "fleet-demo-v1";

function RoadIllustration() {
  return (
    <svg
      className="road-illustration"
      viewBox="0 0 390 260"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="271" cy="88" r="55" fill="#EDC3A0" />
      <path
        d="M122 153c48-51 101-61 160-28s73 17 108-4v139H99Z"
        fill="#6F8276"
      />
      <path d="M5 186c77-66 115-67 192-12s127 8 193-24v110H5Z" fill="#8A9B88" />
      <path
        d="M210 155c-10 21 22 35 56 46 33 10 50 31 43 59h-86c25-28 9-38-13-48-39-17-37-37 0-57Z"
        fill="#D6D8BC"
      />
      <path
        d="M210 166c-5 21 50 33 58 51s-1 26-7 43"
        stroke="#697A69"
        strokeWidth="2"
        strokeDasharray="9 10"
      />
      <path
        d="M335 182v-74m-19 36 19 17 18-17m-32-19 14 14 12-13"
        stroke="#425E50"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="m132 194 9-23c2-5 6-8 12-8h37c6 0 10 3 13 8l12 23"
        fill="#E9B78D"
      />
      <path d="m149 172-7 19h52l-10-19Z" fill="#334F43" />
      <path
        d="M129 190h76c9 0 15 7 15 15v14h-97v-19c0-6 2-10 6-10Z"
        fill="#E8AD7A"
      />
      <path d="M128 207h85" stroke="#C37F54" strokeWidth="2" />
      <rect x="130" y="203" width="13" height="6" rx="2" fill="#FFF1D0" />
      <rect x="201" y="203" width="12" height="6" rx="2" fill="#FFF1D0" />
      <circle cx="143" cy="219" r="10" fill="#2F463C" />
      <circle cx="203" cy="219" r="10" fill="#2F463C" />
      <circle cx="143" cy="219" r="4" fill="#AEBAA9" />
      <circle cx="203" cy="219" r="4" fill="#AEBAA9" />
      <path
        d="M63 223v-44m-12 18 12 11 12-11"
        stroke="#425E50"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M324 45h14m-7-7v14M125 77h10m-5-5v10"
        stroke="#C0CFBC"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M173 67c4-5 9-5 13 0m0 0c4-5 9-5 13 0"
        stroke="#B9C8B7"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function FleetApp() {
  const [page, setPage] = useState<Page>("Overview");
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [detail, setDetail] = useState<Shift | null>(null);
  const [mobile, setMobile] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [period, setPeriod] = useState(0);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "reset">(
    "signup",
  );
  const [authMessage, setAuthMessage] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const authGeneration = useRef(0);
  const loadedUser = useRef<string | null | undefined>(undefined);
  const [profileVersion, setProfileVersion] = useState(0);

  function loadDemo() {
    let data = demoData();
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) writeDemo(localStorage, data);
      if (stored) {
        const parsed = JSON.parse(stored);
        data = {
          profile: profileSchema.parse(parsed.profile),
          shifts: shiftSchema.array().parse(parsed.shifts),
        };
      }
    } catch {
      setError(
        "Browser storage is unavailable or the saved demo could not be read. Demo changes cannot be saved until storage is available or you reset the demo.",
      );
    }
    setProfile(data.profile);
    setShifts(data.shifts);
    setReady(true);
    setLoadFailed(false);
  }
  useEffect(() => {
    if (!supabase) {
      loadDemo();
      return;
    }
    const client = supabase;
    let active = true;
    async function loadAccount(nextUser: User | null) {
      const generation = ++authGeneration.current;
      loadedUser.current = nextUser?.id ?? null;
      setReady(false);
      setUser(nextUser);
      setLoadFailed(false);
      setError("");
      setDetail(null);
      setEditing(null);
      setModal(null);
      if (!nextUser) {
        loadDemo();
        return;
      }
      setProfile(emptyProfile);
      setShifts([]);
      try {
        const [p, s] = await Promise.all([
          client
            .from("profiles")
            .select("data")
            .eq("id", nextUser.id)
            .maybeSingle(),
          loadAccountShifts(nextUser.id),
        ]);
        if (!active || generation !== authGeneration.current) return;
        if (p.error) throw p.error;
        setProfile(
          p.data
            ? profileSchema.parse(p.data.data)
            : {
                ...emptyProfile,
                name: nextUser.user_metadata.name || "Driver",
              },
        );
        setShifts(
          shiftSchema
            .array()
            .parse(s.map((row) => row.data))
            .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
        );
      } catch {
        if (active && generation === authGeneration.current) {
          setError(
            "We couldn’t load your account. Check the Supabase setup and your connection, then reload. Your saved data has not been changed.",
          );
          setLoadFailed(true);
        }
      } finally {
        if (active && generation === authGeneration.current) setReady(true);
      }
    }
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        window.location.assign("/reset-password");
        return;
      }
      if (
        event === "SIGNED_OUT" ||
        ((event === "INITIAL_SESSION" || event === "SIGNED_IN") &&
          loadedUser.current !== (session?.user.id ?? null))
      ) {
        void loadAccount(session?.user ?? null);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const score = fleetScore(profile, shifts);
  const weekly = weekData(shifts, period);
  const weekShifts = shifts.filter((s) =>
    weekly.some((d) => d.date === s.date),
  );
  const totals = weekShifts.reduce(
    (a, s) => ({
      hours: a.hours + s.duration,
      deliveries: a.deliveries + s.deliveries,
      earnings: a.earnings + s.earnings,
    }),
    { hours: 0, deliveries: 0, earnings: 0 },
  );
  const latest = shifts[0];
  const firstName = profile.name.split(" ")[0];
  const initials = profile.name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
  function navigate(next: Page) {
    setPage(next);
    setMobile(false);
    setError("");
  }
  function openModal(next: Modal) {
    setError("");
    setAuthMessage("");
    setModal(next);
  }
  function exportData() {
    const blob = new Blob(
      [JSON.stringify(portableRecord(profile, shifts), null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fleet-record-${localDate()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Your record is downloaded. Private journal notes are excluded.");
  }
  async function saveShift(draft: ShiftDraft, original?: Shift) {
    const generation = authGeneration.current;
    if (loadFailed)
      throw new Error("Reload your account before making changes.");
    let shift: Shift;
    if (user && supabase) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || session.user.id !== user.id)
        throw new Error(
          "Your session changed. Reload before saving this shift.",
        );
      shift = prepareShift(draft, shifts, original);
      if (original) {
        const result = await supabase
          .rpc("fleet_update_shift", {
            shift_id: original.id,
            expected_data: original,
            replacement_data: shift,
          })
          .setHeader("Authorization", `Bearer ${session.access_token}`);
        if (result.error) {
          if (/FLEET_SHIFT_(CONFLICT|UNAVAILABLE)/.test(result.error.message))
            throw new ShiftConflictError();
          if (result.error.code === "23505")
            throw new Error(
              "There’s already a shift for this platform at that date and time.",
            );
          throw new Error(
            "We couldn’t confirm this correction. Your draft is still here. Check your connection and that the shift-corrections migration is installed. If the response was lost, retrying the same correction is safe.",
          );
        }
        shift = shiftSchema.parse(result.data);
      } else {
        const { error } = await supabase
          .from("shifts")
          .insert({ id: shift.id, user_id: user.id, data: shift })
          .setHeader("Authorization", `Bearer ${session.access_token}`);
        if (error)
          throw new Error(
            error.code === "23505"
              ? "This shift is already recorded. Reload to check before logging it again."
              : "We couldn’t confirm the save. Check your connection and reload to check before trying again.",
          );
      }
      if (generation !== authGeneration.current) return;
      setShifts((prev) =>
        [...prev.filter((s) => s.id !== shift.id), shift].sort((a, b) =>
          (b.date + b.time).localeCompare(a.date + a.time),
        ),
      );
    } else {
      const saved = saveDemoShift(localStorage, draft, original);
      shift = saved.shift;
      setShifts(saved.workspace.shifts);
      setProfile(saved.workspace.profile);
    }
    setError("");
    setModal(null);
    setEditing(null);
    setDetail(shift);
    setToast(
      original
        ? "Shift corrected. Your history and Fleet Score are up to date."
        : "Shift logged. Your work is part of your story.",
    );
  }
  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const generation = authGeneration.current;
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const nullable = (key: string) =>
      form.get(key) === "" ? null : Number(form.get(key));
    try {
      if (loadFailed)
        throw new Error("Reload your account before making changes.");
      const data = profileSchema.parse({
        name: form.get("name"),
        city: form.get("city"),
        bio: form.get("bio"),
        reliability: nullable("reliability"),
        safety: nullable("safety"),
        rating: nullable("rating"),
        contributions: Number(form.get("contributions")),
        priorDeliveries: Number(form.get("priorDeliveries")),
      });
      if (user && supabase) {
        const { error } = await supabase
          .from("profiles")
          .upsert({ id: user.id, data });
        if (error)
          throw new Error(
            "Could not save your profile. Check your connection and try again.",
          );
      }
      if (!user) {
        const latest = readDemo(localStorage);
        writeDemo(localStorage, { profile: data, shifts: latest.shifts });
        setShifts(latest.shifts);
      }
      if (generation !== authGeneration.current) return;
      setProfile(data);
      setToast("Profile updated. Your Fleet Score is up to date.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save profile.");
    } finally {
      setBusy(false);
    }
  }
  async function authenticate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setAuthMessage("");
    const form = new FormData(e.currentTarget);
    try {
      if (authMode === "reset") {
        setAuthMessage(
          await requestPasswordReset(
            supabase,
            String(form.get("email")),
            window.location.origin,
          ),
        );
        return;
      }
      const credentials = {
        email: String(form.get("email")).trim(),
        password: String(form.get("password")),
      };
      const name = String(form.get("name") ?? "").trim();
      if (authMode === "signup" && !name)
        throw new Error("Please enter your name.");
      const result =
        authMode === "signup"
          ? await supabase.auth.signUp({
              ...credentials,
              options: { data: { name } },
            })
          : await supabase.auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      if (authMode === "signup" && !result.data.session)
        setAuthMessage(
          "Check your email to confirm your account, then come back here to sign in.",
        );
      else {
        setModal(null);
        setPage("Overview");
        setToast("Welcome to your Fleet.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setError("Could not sign out. Please try again.");
        return;
      }
      setToast("You’re signed out. Back to the sample demo.");
      setPage("Overview");
    }
  }
  async function deleteShift(shift: Shift) {
    if (
      !window.confirm(
        "Delete this shift and its private note? This cannot be undone.",
      )
    )
      return;
    const generation = authGeneration.current;
    setBusy(true);
    setError("");
    try {
      if (user && supabase) {
        const { error } = await supabase
          .from("shifts")
          .delete()
          .eq("id", shift.id)
          .eq("user_id", user.id);
        if (error) throw error;
      }
      if (generation !== authGeneration.current) return;
      if (!user) {
        const latest = readDemo(localStorage);
        const remaining = latest.shifts.filter((s) => s.id !== shift.id);
        writeDemo(localStorage, { profile: latest.profile, shifts: remaining });
        setShifts(remaining);
        setProfile(latest.profile);
      } else setShifts((prev) => prev.filter((s) => s.id !== shift.id));
      setDetail(null);
      setToast("Shift deleted. Your score has been recalculated.");
    } catch {
      setError("Could not delete this shift. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  function shiftTable(rows: Shift[]) {
    return rows.length ? (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Platform / date</th>
              <th>Time on road</th>
              <th>Completed</th>
              <th>Earnings</th>
              <th aria-label="Details" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>
                  <button
                    className="shift-link"
                    onClick={() => {
                      setError("");
                      setDetail(s);
                    }}
                  >
                    <span
                      className={`platform-icon ${s.platform.toLowerCase().replace(" ", "-")}`}
                    >
                      {s.platform === "DoorDash" ? (
                        <span className="dash-icon">»</span>
                      ) : s.platform === "Instacart" ? (
                        <Carrot size={19} />
                      ) : s.platform === "Uber Eats" ? (
                        <span className="uber-logo">
                          Uber
                          <br />
                          <b>Eats</b>
                        </span>
                      ) : (
                        s.platform.slice(0, 2)
                      )}
                    </span>
                    <span>
                      <strong>{s.platform}</strong>
                      <small>
                        {dateLabel(s.date)} <span>·</span> {s.time}
                      </small>
                    </span>
                  </button>
                </td>
                <td>
                  {s.duration} <span className="muted">hrs</span>
                </td>
                <td>
                  {s.deliveries}{" "}
                  <span className="muted">
                    {["Uber", "Lyft"].includes(s.platform)
                      ? "rides"
                      : "deliveries"}
                  </span>
                </td>
                <td className="earnings">{money(s.earnings)}</td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`View ${s.platform} shift on ${dateLabel(s.date)}`}
                    onClick={() => {
                      setError("");
                      setDetail(s);
                    }}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="empty-state">
        <Route size={30} />
        <h3>
          {shifts.length
            ? "No shifts on this platform yet."
            : "Your road starts here."}
        </h3>
        <p>
          {shifts.length
            ? "Try another platform filter, or log a shift to add it here."
            : "Log your first shift to start building a record that belongs to you."}
        </p>
        <button className="button primary" onClick={() => openModal("shift")}>
          <Plus size={17} /> Log a shift
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobile && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        id="fleet-navigation"
        className={`sidebar ${mobile ? "open" : ""}`}
      >
        <a
          href="#"
          className="brand"
          aria-label="Fleet home"
          onClick={(e) => {
            e.preventDefault();
            navigate("Overview");
          }}
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          FLEET<span className="brand-dot">®</span>
        </a>
        <div className="workspace-label">THE DRIVER’S SEAT</div>
        <nav aria-label="Main navigation">
          {(Object.keys(icons) as Page[]).map((item) => {
            const Icon = icons[item];
            return (
              <button
                key={item}
                className={`nav-item ${page === item ? "active" : ""}`}
                onClick={() => navigate(item)}
                aria-current={page === item ? "page" : undefined}
              >
                <Icon size={19} />
                <span>{item}</span>
                {item === "Fleet Score" && ready && (
                  <span className="nav-score">{score.total}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="belong-card">
            <span className="belong-icon">
              <Users size={21} />
            </span>
            <h3>
              Independent.
              <br />
              Never alone.
            </h3>
            <p>
              A little more ownership.
              <br />A lot more possibility.
            </p>
            <button onClick={() => openModal("about")}>
              This is your Fleet <ArrowUpRight size={16} />
            </button>
          </div>
          <button className="sidebar-help" onClick={() => openModal("about")}>
            <Coffee size={18} /> A note from Fleet <ArrowUpRight size={15} />
          </button>
          <button
            className="sidebar-profile"
            onClick={() => navigate("My profile")}
          >
            <span className="avatar">{initials}</span>
            <span>
              <strong>{profile.name}</strong>
              <small>{user ? "Independent driver" : "Demo driver"}</small>
            </span>
            <Settings2 size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={mobile}
              aria-controls="fleet-navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <span>Your workspace</span>
            <ChevronRight size={13} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className="ownership">
              <span /> Driver-owned. Always.
            </span>
            {user ? (
              <button className="button small ghost" onClick={signOut}>
                <LogOut size={15} /> Sign out
              </button>
            ) : (
              <button className="demo-badge" onClick={() => openModal("auth")}>
                Demo workspace <ChevronDown size={13} />
              </button>
            )}
            <button
              className="avatar small-avatar"
              aria-label="Open your profile"
              onClick={() => navigate("My profile")}
            >
              {initials}
            </button>
          </div>
        </header>
        <main id="main-content">
          {error && !modal && !detail && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          {!ready ? (
            <div className="loading-state">
              <span className="brand-mark">
                <i />
                <i />
                <i />
              </span>
              <p>Getting your workspace ready…</p>
            </div>
          ) : loadFailed ? (
            <div className="empty-state">
              <h2>Your account couldn’t be loaded</h2>
              <p>We’ve paused changes to protect your data.</p>
              <button
                className="button primary"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {page === "Overview"
                      ? "YOUR WORK. YOUR REPUTATION."
                      : page === "My shifts"
                        ? "EVERY SHIFT HAS A STORY."
                        : page === "Fleet Score"
                          ? "BUILT BY YOU. OWNED BY YOU."
                          : "MORE THAN A DRIVER ID."}
                  </div>
                  <h1>
                    {page === "Overview"
                      ? `Good to see you, ${firstName}.`
                      : page === "My shifts"
                        ? "The work you put in."
                        : page === "Fleet Score"
                          ? "A reputation that goes with you."
                          : "Your story, on your terms."}
                    <span className="heading-dot">
                      {page === "Overview" ? " ☀" : ""}
                    </span>
                  </h1>
                  <p>
                    {page === "Overview"
                      ? "Every mile matters. Here’s a little perspective on yours."
                      : page === "My shifts"
                        ? "Your hours, your effort, your own record. All in one place."
                        : page === "Fleet Score"
                          ? "Not tied to a platform. Not left behind when you move on."
                          : "Keep your details up to date and make this space your own."}
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => openModal("shift")}
                >
                  <Plus size={18} /> Log a shift
                </button>
              </div>
              {page === "Overview" && (
                <>
                  <div className="hero-grid">
                    <section className="recognition-card">
                      <div className="recognition-content">
                        <div className="recognition-eyebrow">
                          <Sparkles size={15} /> A LITTLE RECOGNITION
                        </div>
                        <h2>
                          You do more than
                          <br />
                          get from A to B.
                        </h2>
                        <p>
                          {latest
                            ? `That last ${latest.duration}-hour shift? ${latest.deliveries ? `${latest.deliveries} ${["Uber", "Lyft"].includes(latest.platform) ? "rides" : "deliveries"} that didn’t happen on their own.` : "Time and effort that deserve to be seen."} You showed up. You made it happen.`
                            : "The early starts. The extra stops. The effort that doesn’t fit in a star rating. We see the work you do."}
                        </p>
                        <button
                          className="recognition-link"
                          onClick={() =>
                            latest ? setDetail(latest) : openModal("shift")
                          }
                        >
                          {latest
                            ? "A moment for your last shift"
                            : "Make your first entry"}{" "}
                          <ArrowRight size={16} />
                        </button>
                      </div>
                      <RoadIllustration />
                      <div className="hero-caption">
                        <span /> YOUR EFFORT DOESN’T GO UNNOTICED.
                      </div>
                    </section>
                    <section className="score-card">
                      <div className="card-title">
                        <h2>
                          <ShieldCheck size={18} /> Your Fleet Score
                        </h2>
                        <button
                          className="icon-button"
                          aria-label="View Fleet Score details"
                          onClick={() => navigate("Fleet Score")}
                        >
                          <ArrowUpRight size={19} />
                        </button>
                      </div>
                      <div className="score-display">
                        <span>{score.total}</span>
                        <span className="score-denominator">/ 1,000</span>
                        <span className="score-seal">
                          <ShieldCheck size={27} />
                        </span>
                      </div>
                      <div className="score-track">
                        <div
                          className={`width-${Math.round(score.total / 10)}`}
                        />
                      </div>
                      <div className="score-subline">
                        <span>
                          <span className="green-dot" />
                          {score.complete
                            ? "Building your own legacy"
                            : "A reputation in progress"}
                        </span>
                        <span>Self-reported</span>
                      </div>
                      <p>
                        Platforms change.
                        <br />
                        <strong>Your reputation stays with you.</strong>
                      </p>
                      <button
                        className="text-link"
                        onClick={() => navigate("Fleet Score")}
                      >
                        See what goes into your score <ArrowRight size={16} />
                      </button>
                    </section>
                  </div>
                  <div className="section-heading week-heading">
                    <h2>
                      Your week, at a glance <span className="live-dot" />
                    </h2>
                    <div className="week-controls">
                      <button
                        className="icon-button"
                        aria-label="Previous week"
                        onClick={() => setPeriod((p) => p - 1)}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span>
                        {period === 0
                          ? "This week"
                          : `${dateLabel(weekly[0].date)} – ${dateLabel(weekly[6].date)}`}
                      </span>
                      <button
                        className="icon-button"
                        aria-label="Next week"
                        disabled={period === 0}
                        onClick={() => setPeriod((p) => Math.min(0, p + 1))}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="stats-grid">
                    <Stat
                      icon={<CheckCheck size={19} />}
                      label="Shifts logged"
                      value={String(weekShifts.length)}
                      suffix="shifts"
                      note="Showing up, on your terms"
                      color="green"
                    />
                    <Stat
                      icon={<Clock3 size={19} />}
                      label="Time on the road"
                      value={String(Number(totals.hours.toFixed(2)))}
                      suffix="hrs"
                      note="Time that deserves to count"
                      color="gold"
                    />
                    <Stat
                      icon={<Truck size={19} />}
                      label="Completed trips"
                      value={String(totals.deliveries)}
                      suffix="trips"
                      note="One stop. A real difference."
                      color="purple"
                    />
                    <Stat
                      icon={<Wallet size={19} />}
                      label="Reported earnings"
                      value={money(totals.earnings)}
                      note="Your hustle, in numbers"
                      color="peach"
                    />
                  </div>
                  <div className="lower-grid">
                    <section className="card recent-card">
                      <div className="card-title">
                        <h2>
                          Recent shifts{" "}
                          <span className="count-badge">{shifts.length}</span>
                        </h2>
                        <button
                          className="text-link"
                          onClick={() => navigate("My shifts")}
                        >
                          View all <ArrowRight size={15} />
                        </button>
                      </div>
                      {shiftTable(shifts.slice(0, 3))}
                    </section>
                    <section className="card activity-card">
                      <div className="card-title">
                        <h2>A week in motion</h2>
                        <span className="tiny-label">HOURS</span>
                      </div>
                      <div className="chart-summary">
                        <strong>
                          {Number(totals.hours.toFixed(2))}
                          <span> hrs</span>
                        </strong>
                        <span>
                          {period === 0 ? "This week" : "Selected week"}
                        </span>
                      </div>
                      <div
                        className="chart"
                        role="img"
                        aria-label={weekly
                          .map((d) => `${d.label}: ${d.hours} hours`)
                          .join(", ")}
                      >
                        <div className="chart-grid">
                          <span>
                            {Math.max(8, ...weekly.map((w) => w.hours))}h
                          </span>
                          <span>
                            {Math.max(8, ...weekly.map((w) => w.hours)) / 2}h
                          </span>
                          <span>0</span>
                        </div>
                        <div className="chart-bars">
                          {weekly.map((d) => (
                            <div
                              className={`chart-day ${d.date === localDate() ? "today" : ""}`}
                              key={d.date}
                            >
                              <div className="bar-space">
                                <div
                                  className={`bar height-${Math.round(Math.min(100, (d.hours / Math.max(8, ...weekly.map((w) => w.hours))) * 100))}`}
                                  title={`${d.hours} hours`}
                                />
                              </div>
                              <span>{d.label.charAt(0)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="chart-footer">
                        <span className="green-dot" /> A little progress, every
                        time you show up.
                      </div>
                    </section>
                  </div>
                  <section className="ownership-banner">
                    <span className="ownership-icon">
                      <LockKeyhole size={20} />
                    </span>
                    <div>
                      <h3>Your story belongs to you.</h3>
                      <p>
                        Your profile, your shifts, your reputation. Take them
                        wherever the road leads.
                      </p>
                    </div>
                    <button onClick={exportData}>
                      Export your record <ArrowDownToLine size={16} />
                    </button>
                  </section>
                </>
              )}
              {page === "My shifts" && (
                <ShiftHistory
                  key={user?.id ?? "demo"}
                  shifts={shifts}
                  renderRows={shiftTable}
                  exportRecord={exportData}
                />
              )}
              {page === "Fleet Score" && (
                <div className="score-page-grid">
                  <section className="card score-explainer">
                    <div className="eyebrow">YOUR PORTABLE REPUTATION</div>
                    <div className="big-score">
                      {score.total}
                      <span>/ 1,000</span>
                    </div>
                    <span className="pill">
                      <ShieldCheck size={14} />{" "}
                      {score.complete
                        ? "Self-reported score"
                        : "Incomplete · missing inputs count as zero"}
                    </span>
                    <h2>Not another platform rating.</h2>
                    <p>
                      This score brings your work together in one place. You
                      control the record, and you can take a copy with you at
                      any time.
                    </p>
                    <button className="button primary" onClick={exportData}>
                      <ArrowDownToLine size={17} /> Export my reputation
                    </button>
                    <button
                      className="button ghost full-button report-open-button"
                      onClick={() => openModal("report")}
                    >
                      <Printer size={17} /> Preview printable record
                    </button>
                    <div className="info-note">
                      <LockKeyhole size={18} />
                      <p>
                        No platform connections or verification yet. This is a
                        transparent MVP calculation from your own reports, not
                        an independently verified credential.
                      </p>
                    </div>
                  </section>
                  <section className="card component-card">
                    <div className="card-title">
                      <h2>What goes into your score</h2>
                      <Award size={20} />
                    </div>
                    {score.components.map((c, i) => (
                      <div className="score-component" key={c.name}>
                        <div>
                          <span className={`component-icon component-${i}`}>
                            {
                              [
                                <CheckCheck size={18} key="a" />,
                                <ShieldCheck size={18} key="b" />,
                                <Heart size={18} key="c" />,
                                <Users size={18} key="d" />,
                                <Route size={18} key="e" />,
                              ][i]
                            }
                          </span>
                          <div>
                            <h3>
                              {c.name}
                              <span>{c.weight}% of score</span>
                            </h3>
                            <p>{c.description}</p>
                          </div>
                          <strong>
                            {c.value === null ? "—" : Math.round(c.value)}
                            <small>/100</small>
                          </strong>
                        </div>
                        <div className="component-track">
                          <div
                            className={`width-${Math.round(c.value ?? 0)}`}
                          />
                        </div>
                      </div>
                    ))}
                    <div className="component-footer">
                      <p>
                        Formula: sum of each component × its weight × 10.
                        Missing data earns no points.
                      </p>
                      <button
                        className="text-link"
                        onClick={() => navigate("My profile")}
                      >
                        Update your inputs <ArrowRight size={16} />
                      </button>
                    </div>
                  </section>
                </div>
              )}
              {page === "My profile" && (
                <div className="profile-grid">
                  <section className="card profile-summary">
                    <span className="avatar profile-avatar">{initials}</span>
                    <h2>{profile.name}</h2>
                    <span className="profile-city">
                      <MapPin size={14} />
                      {profile.city || "Your city, your roads"}
                    </span>
                    <p>
                      {profile.bio ||
                        "A fresh start. A story only you can tell."}
                    </p>
                    <div className="profile-score">
                      <ShieldCheck size={20} />
                      <strong>{score.total}</strong>
                      <span>Fleet Score</span>
                    </div>
                    <div className="info-note">
                      <LockKeyhole size={18} />
                      <p>
                        Your profile is private. Exporting creates a file you
                        can choose to share.
                      </p>
                    </div>
                    {!user && (
                      <button
                        className="button secondary"
                        onClick={() => openModal("auth")}
                      >
                        Create a real account <ArrowRight size={16} />
                      </button>
                    )}
                  </section>
                  <form
                    className="card profile-form"
                    onSubmit={saveProfile}
                    key={`${user?.id || "demo"}:${profileVersion}`}
                  >
                    <h2>The person behind the wheel</h2>
                    <p className="muted">
                      A few details to make Fleet feel like you.
                    </p>
                    <div className="form-grid">
                      <label>
                        Full name
                        <input
                          name="name"
                          required
                          maxLength={60}
                          defaultValue={profile.name}
                        />
                      </label>
                      <label>
                        City
                        <input
                          name="city"
                          maxLength={80}
                          placeholder="Austin, TX"
                          defaultValue={profile.city}
                        />
                      </label>
                      <label className="full-width">
                        A little about you{" "}
                        <span className="optional">optional</span>
                        <textarea
                          name="bio"
                          maxLength={500}
                          rows={3}
                          defaultValue={profile.bio}
                        />
                      </label>
                    </div>
                    <div className="form-section-title">
                      <h3>Your reputation inputs</h3>
                      <p>
                        Self-reported, not platform-verified. Leave unknown
                        percentages or ratings blank. Do not include
                        Fleet-logged deliveries in prior deliveries.
                      </p>
                    </div>
                    <div className="form-grid">
                      <label>
                        On-time deliveries (%)
                        <input
                          type="number"
                          name="reliability"
                          min="0"
                          max="100"
                          step="0.1"
                          defaultValue={profile.reliability ?? ""}
                          placeholder="Not provided"
                        />
                      </label>
                      <label>
                        Incident-free shifts (%)
                        <input
                          type="number"
                          name="safety"
                          min="0"
                          max="100"
                          step="0.1"
                          defaultValue={profile.safety ?? ""}
                          placeholder="Not provided"
                        />
                      </label>
                      <label>
                        Average customer rating (out of 5)
                        <input
                          type="number"
                          name="rating"
                          min="0"
                          max="5"
                          step="0.01"
                          defaultValue={profile.rating ?? ""}
                          placeholder="Not provided"
                        />
                      </label>
                      <label>
                        Times you’ve helped other drivers
                        <input
                          type="number"
                          name="contributions"
                          min="0"
                          max="100000"
                          required
                          defaultValue={profile.contributions}
                        />
                      </label>
                      <label className="full-width">
                        Deliveries completed before joining Fleet
                        <input
                          type="number"
                          name="priorDeliveries"
                          min="0"
                          max="1000000"
                          required
                          defaultValue={profile.priorDeliveries}
                        />
                      </label>
                    </div>
                    <div className="form-footer">
                      <span>
                        <LockKeyhole size={14} />{" "}
                        {user
                          ? "Private to your account"
                          : "Saved in this browser"}
                      </span>
                      <button className="button primary" disabled={busy}>
                        {busy ? "Saving…" : "Save profile"}
                        <Check size={16} />
                      </button>
                    </div>
                  </form>
                </div>
              )}
              {page === "My profile" && (
                <AccountControls
                  key={user?.id || "demo"}
                  profile={profile}
                  shifts={shifts}
                  user={user}
                  notify={setToast}
                  onChanged={(nextProfile, nextShifts) => {
                    if (
                      loadedUser.current !== undefined &&
                      loadedUser.current !== (user?.id ?? null)
                    )
                      return;
                    setProfile(nextProfile);
                    setShifts(nextShifts);
                    setProfileVersion((v) => v + 1);
                  }}
                  onReset={(blank) => {
                    if (user) return;
                    const data = blank
                      ? { profile: emptyProfile, shifts: [] }
                      : demoData();
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                    setProfile(data.profile);
                    setShifts(data.shifts);
                    setProfileVersion((v) => v + 1);
                    setPage("Overview");
                  }}
                />
              )}
              <footer className="page-footer">
                <span>Built for the people behind the wheel.</span>
                <span>
                  INDEPENDENT, TOGETHER.{" "}
                  <span className="footer-symbol">↗</span>
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={17} />
          </span>
          {toast}
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {(modal === "shift" || modal === "edit-shift") && (
        <ShiftEditor
          key={modal === "edit-shift" ? editing?.id : "new"}
          original={modal === "edit-shift" ? (editing ?? undefined) : undefined}
          demo={!user}
          save={saveShift}
          close={() => {
            setModal(null);
            setEditing(null);
            setError("");
          }}
        />
      )}
      {modal === "report" && (
        <ReputationReport
          profile={profile}
          shifts={shifts}
          demo={!user}
          close={() => setModal(null)}
          exportRecord={exportData}
        />
      )}
      {detail && (
        <Dialog
          title="That work matters."
          subtitle={`${detail.platform} · ${dateLabel(detail.date)} · ${detail.time}`}
          close={() => {
            if (!busy) {
              setDetail(null);
              setError("");
            }
          }}
        >
          <div className="recognition-detail">
            <Sparkles size={22} />
            <p>{detail.recognition}</p>
            <span>A MOMENT OF RECOGNITION, FROM FLEET.</span>
          </div>
          <div className="detail-stats">
            <div>
              <Clock3 size={18} />
              <strong>{detail.duration} hrs</strong>
              <span>Time on the road</span>
            </div>
            <div>
              <Truck size={18} />
              <strong>{detail.deliveries}</strong>
              <span>Completed trips</span>
            </div>
            <div>
              <Wallet size={18} />
              <strong>{money(detail.earnings)}</strong>
              <span>Reported earnings</span>
            </div>
          </div>
          {detail.note && (
            <div className="private-note">
              <h3>
                <LockKeyhole size={15} /> Just for you
              </h3>
              <p>{detail.note}</p>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          <button
            className="button secondary full-button"
            disabled={busy}
            onClick={() => {
              setEditing(detail);
              setDetail(null);
              setError("");
              setModal("edit-shift");
            }}
          >
            <PencilLine size={16} /> Edit shift
          </button>
          <div className="dialog-actions">
            <button
              className="delete-button"
              disabled={busy}
              onClick={() => deleteShift(detail)}
            >
              Delete shift
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => setDetail(null)}
            >
              Keep moving <ArrowRight size={16} />
            </button>
          </div>
        </Dialog>
      )}
      {modal === "auth" && (
        <Dialog
          title={
            supabase
              ? authMode === "signup"
                ? "Your own road starts here."
                : authMode === "reset"
                  ? "Let’s get you back on the road."
                  : "Welcome back to your Fleet."
              : "Take Fleet for a spin."
          }
          subtitle={
            supabase
              ? "A private home for your work and your reputation."
              : "You’re exploring a fully interactive sample workspace."
          }
          close={() => {
            if (!busy) {
              setModal(null);
              setError("");
            }
          }}
        >
          {!supabase ? (
            <>
              <div className="auth-demo-info">
                <ShieldCheck size={30} />
                <h3>The demo is yours to explore.</h3>
                <p>
                  Log a shift, update the sample profile, and export a portable
                  record. Demo changes stay in this browser — no account is
                  created.
                </p>
                <p>
                  Real accounts need a connected Supabase project. Setup
                  instructions are included in the repository README.
                </p>
              </div>
              <button
                className="button primary full-button"
                onClick={() => setModal(null)}
              >
                Back to my workspace <ArrowRight size={16} />
              </button>
            </>
          ) : (
            <form onSubmit={authenticate}>
              <fieldset className="plain-fieldset" disabled={busy}>
                <div className="auth-tabs">
                  <button
                    type="button"
                    className={authMode === "signup" ? "selected" : ""}
                    onClick={() => {
                      setAuthMode("signup");
                      setError("");
                      setAuthMessage("");
                    }}
                  >
                    Create account
                  </button>
                  <button
                    type="button"
                    className={authMode === "signin" ? "selected" : ""}
                    onClick={() => {
                      setAuthMode("signin");
                      setError("");
                      setAuthMessage("");
                    }}
                  >
                    Sign in
                  </button>
                </div>
                <div className="form-grid">
                  {authMode === "signup" && (
                    <label className="full-width">
                      Your name
                      <input
                        name="name"
                        required
                        maxLength={60}
                        autoComplete="name"
                      />
                    </label>
                  )}
                  <label className="full-width">
                    Email address
                    <input
                      type="email"
                      name="email"
                      required
                      autoComplete="email"
                    />
                  </label>
                  {authMode !== "reset" && (
                    <label className="full-width">
                      Password
                      <input
                        type="password"
                        name="password"
                        required
                        minLength={8}
                        maxLength={128}
                        autoComplete={
                          authMode === "signup"
                            ? "new-password"
                            : "current-password"
                        }
                      />
                      <small className="muted">At least 8 characters.</small>
                    </label>
                  )}
                </div>
                {error && (
                  <div className="error-banner" role="alert">
                    {error}
                  </div>
                )}
                {authMessage && (
                  <div className="success-banner" role="status">
                    {authMessage}
                  </div>
                )}
                <button className="button primary full-button" disabled={busy}>
                  {busy
                    ? "One moment…"
                    : authMode === "signup"
                      ? "Create my account"
                      : authMode === "reset"
                        ? "Send reset link"
                        : "Sign in"}
                  <ArrowRight size={16} />
                </button>
                {authMode === "signin" && (
                  <button
                    type="button"
                    className="text-link forgot-password"
                    onClick={() => {
                      setAuthMode("reset");
                      setError("");
                      setAuthMessage("");
                    }}
                  >
                    Forgot your password?
                  </button>
                )}
              </fieldset>
              <p className="auth-footnote">
                Real accounts start empty. Sample demo data is never copied to
                your account.
              </p>
            </form>
          )}
        </Dialog>
      )}
      {modal === "about" && (
        <Dialog
          title="Independent. Never alone."
          subtitle="A note from the people building Fleet."
          close={() => setModal(null)}
        >
          <div className="about-content">
            <p>
              You do work that people count on. But too often, the record of
              that work — and the recognition for it — belongs to someone else.
            </p>
            <p>
              Fleet is a different kind of home for independent drivers. A place
              to keep your reputation, acknowledge your effort, and own your
              story.
            </p>
            <div className="about-values">
              <span>
                <ShieldCheck size={19} /> Your reputation is portable.
              </span>
              <span>
                <Heart size={19} /> Your effort is seen.
              </span>
              <span>
                <LockKeyhole size={19} /> Your private thoughts stay private.
              </span>
            </div>
            <p>
              We’re starting with the essentials: your profile, your shifts, and
              your Fleet Score. No marketplace. No promises of financing. Just a
              foundation built around you.
            </p>
            <strong>Here’s to the people behind the wheel.</strong>
          </div>
          <button
            className="button primary full-button"
            onClick={() => setModal(null)}
          >
            Glad to be here <ArrowRight size={16} />
          </button>
        </Dialog>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  suffix,
  note,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  suffix?: string;
  note: string;
  color: string;
}) {
  return (
    <section className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${color}`}>{icon}</span>
      </div>
      <div className="stat-value">
        {value}
        <span>{suffix}</span>
      </div>
      <div className="stat-note">{note}</div>
    </section>
  );
}
