# FLEET

**Your work. Your reputation.** A Phase 1 web app for independent gig drivers: a portable reputation, a record of their work, and specific acknowledgment of that effort.

The original full concept is preserved in [`docs/FLEET_SPEC.md`](docs/FLEET_SPEC.md). This build intentionally excludes the marketplace, financing, benefits, governance, blockchain, and collective-action tooling.

## Run it

Requires Node.js 22+ and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The server binds to `0.0.0.0` and accepts Arena preview hosts.

**No configuration is needed for the demo.** A clearly labeled sample driver workspace loads with eight shifts. Changes persist in that browser's local storage. Do not put sensitive personal information into the demo, particularly on a shared device. Use **My profile → Reset demo** to restore the sample workspace or start empty. Reset requires typing `RESET` and never affects cloud accounts.

```sh
# Production
npm run build
npm run start
```

## What works

- Responsive dashboard, with weekly hours, completed trips, self-reported earnings, and recent shifts.
- Shift logging: platform, date, start time, duration, completed trips, optional earnings, and optional long-form private journal note.
- Immediate, shift-specific recognition; view it again from shift history.
- Shift corrections that preserve identity and existing journal text, with fact-based recognition updates and cloud snapshot-conflict protection.
- Search by platform/date/start time, inclusive date filters, sorting, paginated history, and summaries of matching shifts.
- Shift details, deletion with confirmation, and persistent state.
- A printable reputation preview with optional recent history, earnings, and bio. Save as PDF through the browser’s print dialog; notes never enter the printable view model.
- A 0–1000 Fleet Score with the original five component weights, visible inputs, and explanation of missing data.
- Editable driver profile and self-reported reputation inputs.
- Portable JSON export of profile, score, and shift history. **Private journal notes are always excluded.** The download contains personal/profile and earnings information; share it only deliberately.
- Password recovery with a dedicated reset page, confirmation validation, and generic email responses that do not reveal account existence.
- Import preview, duplicate-safe merge, optional profile restoration, and opt-in private backups with journal notes.
- Self-service account deletion with typed confirmation, password reauthentication, and a server-enforced five-minute password-proof requirement.
- Email/password signup, confirmation, login, logout, and account-private Postgres persistence when Supabase is configured. New accounts start empty; demo data is never silently imported.
- Loading, empty, save-error, and account-load-error states. Failed cloud writes never silently become local demo records.
- Keyboard-operable dialogs with focus trapping/restoration, responsive navigation, and reduced-motion support.

## Connect real accounts

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) **once in a fresh database** using the project's SQL editor. It creates `profiles` and `shifts`, constraints, indexes, grants, and per-user row-level-security policies. Then apply these migrations in order:
   - [`002_account_controls.sql`](supabase/migrations/002_account_controls.sql): atomic imports and self-service account deletion.
   - [`003_shift_corrections.sql`](supabase/migrations/003_shift_corrections.sql): guarded shift corrections.

   **Existing projects run only migrations they haven’t applied**, not `schema.sql` again. Both migrations are safe to re-run.
3. Copy `.env.example` to `.env.local`:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
   ```

   Use the **public** anon/publishable key, never the service-role/secret key. No service credential is needed by this app.
4. In Supabase Authentication settings, enable the email/password provider. Set **Site URL** to the deployed app's HTTPS origin (or your Arena preview origin). Add `https://YOUR_APP_ORIGIN/reset-password` to the **Redirect URLs** allowlist (include the full path; use your actual deployment or Arena preview origin). Keep email confirmation enabled for real users; configure production SMTP before launch. Keep the standard Supabase recovery email link (`{{ .ConfirmationURL }}`), which establishes the recovery session before returning to Fleet.
5. Restart the dev server, or rebuild/redeploy production (Next.js public environment values are embedded at build time).
6. Click **Demo workspace → Create account**. Confirm your email, then sign in. Each account starts with an empty shift log and incomplete score.

### Before inviting real drivers

The SQL ownership policies are tested locally against embedded Postgres. **Live Supabase email delivery, confirmation, recovery links, hosted account deletion, session refresh, and deployment configuration still need verification in your own project**; no external account was provisioned by this build.

- Create two real test users; verify each sees only their own profile and shifts, including after refresh, logout, and login on another device. Open the same shift in two tabs, save a correction in one, and verify that the other gets a conflict rather than overwriting it.
- Try reading/deleting the other user's shift ID with the authenticated Supabase client; it must not return or alter another driver's row.
- Verify signup, confirmation links, recovery email redirects, password changes, and logout on the final domain. Expired reset links should offer a new request. Enable sensible Auth rate limits and SMTP controls.
- With disposable accounts, test deletion after a fresh password confirmation. Confirm that the auth user, sessions, profile, and shifts are removed while the other driver’s data remains. The deletion RPC checks the signed JWT’s `amr` password timestamp; keep Supabase’s standard authentication claims intact.
- Set database backup/retention policies and decide on a privacy policy and support process. Self-service account deletion cascades to the user’s live profile and shifts and deletes the auth user. It does not erase previously downloaded files or operator backups; disclose and enforce a backup-retention policy. The current deletion UI supports email/password accounts, matching the MVP auth provider.
- Database administrators/service-role holders can access stored data. Notes are protected from other app users by RLS, **not end-to-end encrypted**. Do not market them as inaccessible to the operator.
- If deploying outside Arena, narrow `frame-ancestors` in `middleware.ts` to the actual embedding origins or `'none'` for a non-embedded application.

## Score model (v1, transparent and self-reported)

| Component | Weight | Normalization to 0–100 |
|---|---:|---|
| Reliability | 25% | Reported on-time delivery percentage |
| Safety | 20% | Reported incident-free shift percentage |
| Customer rating | 25% | Reported rating out of five × 20 |
| Community | 15% | Reported times helping other drivers ÷ 20 × 100; capped at 100 |
| Experience | 15% | Prior deliveries + deliveries logged in Fleet ÷ 1,000 × 100; capped at 100 |

The total is `round(sum(component × weight / 10))` where weights are the integer percentages above. Missing percentage/rating inputs contribute zero and mark the score incomplete. Past delivery counts must exclude work already logged in Fleet. Earnings and private notes never influence the score. The 20-help and 1,000-delivery normalization thresholds are explicit MVP design choices, not thresholds supplied by or validated with a platform. No automatic tier or fee claims are made.

**No delivery platform is connected, and the score is not a verified credential.** All inputs are self-reported, clearly labeled in the UI and export. Drivers can edit their data. Future verification will require a separate evidence model, not relabeling this data as verified.

## Recognition and privacy

Recognition is generated locally by a deterministic, fact-grounded composer, not an external AI service. It rotates eight core phrasings, incorporates recorded duration/trips/platform/date/time, checks existing messages to avoid exact duplicates, and uses a unique record counter if all variations have been used. Rephrased themes can recur; this is **not unlimited human-authored or LLM originality**. There are no invented claims about who received a delivery or why they needed it.

Private notes are not used to generate recognition, not sent to a model, and not included in portable exports. In account mode they are stored in the user's RLS-protected shift record; in demo mode they exist only in local storage. An explicitly selected **private backup** can include journal notes for the driver’s own safekeeping. These files are plain-text JSON, not encrypted, and the UI warns against sharing them. There are no analytics, social feeds, public profiles, or public sharing URLs in this MVP.

## Daily workflow

### Correct a shift

Open a shift from the dashboard or **My shifts**, then choose **Edit shift**. Every field is prefilled, including the private note. Saving updates that record in place—its UUID, ownership, and cloud creation time stay the same. Clearing the note deliberately removes it from the live record; no old-note audit log is kept by the app (operator backups may still retain old data under their retention policy).

Recognition is recomposed only if the platform, date, start time, duration, or completed trips change. An earnings-only or note-only correction keeps the prior recognition. The Fleet Score and activity summaries recalculate after a successful save. Duplicate platform/date/start-time combinations remain disallowed.

Cloud edits use `fleet_update_shift`: a narrowly scoped security-definer function that locks the caller’s row, checks the original JSON snapshot, validates the replacement against the table’s constraints, and updates only that row. Direct table UPDATE remains denied. Stale or deleted records leave the unsaved draft visible and offer a reload; a retry of the exact same successful correction is idempotent if its response was lost. The browser pins the request to the session that opened the operation.

In the demo, saves re-read the latest local-storage record before modifying it, preserve unrelated shifts/profile changes, and reject a detected stale snapshot. Browser storage is not a multi-process database: truly simultaneous cross-tab writes are best-effort, not transactional. A storage/quota failure is reported before claiming that a save succeeded.

### Find older work

**My shifts** combines platform, inclusive date range, and multi-word search. Search indexes only platform, date, and start time—not journals or recognition. Sort newest/oldest, highest earnings, or longest duration; select 10/25/50 rows per page. The summary covers all matching results, not only the current page. The **Export** button still exports the **full** portable JSON record, regardless of filters.

### Make a human-readable record

Under **Fleet Score → Preview printable record**, choose which details to include. Earnings, bio, and recent shift history are off by default. The preview labels the score self-reported, explains the formula, and marks demo data as demo data. It is not a verified credential, safety certificate, or background check.

**Print / save PDF** opens the browser’s native print dialog. Use its Save as PDF destination if available. Print styles isolate the record from the rest of the workspace. The optional history contains up to ten recent shifts; the full JSON export contains the complete history. No public URL is created, and private journal notes and recognition text are excluded from the printable data model—not merely hidden with CSS. Printed/downloaded copies are not encrypted.

## Data ownership controls

Find these under **My profile → Ownership isn’t just a score**:

- **Download a copy** defaults to the portable record (no notes). Only checking **Include my private journal notes** creates a `private-backup` file containing them. The regular dashboard/export buttons never include notes.
- **Import a record** accepts Fleet v1 portable exports and private backups up to 5 MB and 5,000 shifts per file. It validates the entire file before offering confirmation. Files with unsupported versions, invalid values, or impossible/future dates are rejected.
- A shift with the same platform, date, and start time is already recorded: imports skip it and never overwrite its note, earnings, or recognition. New shifts receive fresh UUIDs, so a driver can import their record into another account. Re-importing the same file is idempotent.
- Profile restoration is a separate, unchecked-by-default choice. It replaces the name, city, bio, and **all** self-reported score inputs. Check prior delivery counts carefully to avoid double-counting logged work. Scores contained in files are ignored; Fleet recalculates the score from validated inputs.
- Cloud imports use one PostgreSQL transaction; a failed shift/profile validation rolls back the entire operation. Demo imports atomically replace one local-storage value, and quota failures leave the old value untouched. Imports never delete existing shifts. When a cloud response is uncertain, Fleet asks you to reload before retrying; when a commit succeeds but its refresh fails, it explicitly reports the import as saved and offers a reload.
- **Reset demo** can restore the sample driver or start with an empty workspace. It is not available for real accounts and cannot affect them.
- **Delete account** requires typing `DELETE MY ACCOUNT` and entering the current password. The security-definer RPC accepts no target user ID, fixes its search path, checks a fresh password timestamp in the signed JWT, and deletes only `auth.uid()`. Neither the application nor its browser holds a service-role key.

This is a merge/restore facility, not a general-purpose data importer. It does not import arbitrary platform CSVs, and it does not verify the truth of self-reported information.

## Architecture

- Next.js 15 App Router, React 19, TypeScript; CSS with self-hosted Manrope font and custom SVG illustration.
- `components/fleet-app.tsx`: interactive workspace, forms, navigation, auth, storage. Repeated same-user auth events do not discard unsaved forms; responses from a previous session cannot write into a different user’s workspace.
- `components/account-controls.tsx` and `lib/records.ts`: data export/import, private backups, and account controls.
- `components/password-recovery.tsx`, `app/reset-password/`, and `lib/auth.ts`: password recovery, validation, and SDK calls.
- `components/dialog.tsx`: shared focus-trapped dialog with CSP-safe scroll locking.
- `components/shift-editor.tsx`, `components/shift-history.tsx`, `lib/shifts.ts`, and `lib/demo-store.ts`: corrections, search/sorting, pagination, conflict handling, and checked demo persistence.
- `components/reputation-report.tsx` and `lib/reputation-report.ts`: allowlisted printable data and an isolated print portal.
- `lib/fleet.ts`: Zod validation, score calculation, recognition composition, export, demo data, weekly summaries.
- `lib/supabase.ts`: optional public-key browser client. Supabase's authenticated PostgREST API is the MVP backend; a redundant standalone Express server is not needed.
- `supabase/schema.sql` and numbered migrations: database schema, row-level security, atomic imports, guarded account deletion, and conflict-safe shift corrections. Raw shift UPDATE remains denied; corrections use the narrowly scoped RPC.
- `middleware.ts`: per-request nonce CSP with **no `unsafe-inline`**, content-type, referrer, permissions, and cache headers. The app route is dynamically rendered to provide fresh nonces. Development alone allows `unsafe-eval` for Next.js tooling.
- Bounded CSS classes, rather than inline style attributes, render score bars and activity charts. No hand-built SQL interpolation is used in the application.
- `tests/`: domain/validation/privacy tests, actual PostgreSQL RLS tests via PGlite, and Playwright browser flows.

## Validation

```sh
npm test                 # 46 domain, auth-helper, and embedded-Postgres checks
npm run typecheck
npm run build
npm audit

# Browser checks (install Chromium once)
npx playwright install --with-deps chromium
npm run test:e2e         # 11 demo/ownership/history/print/CSP browser tests
npm run test:e2e:auth    # 8 auth/cloud-UI browser tests with intercepted SDK requests
```

Run the default browser tests against an **unconfigured demo app** (no Supabase env vars). For production CSP verification, start `npm run build && npm run start` first. `FLEET_TEST_URL` and `CHROMIUM_PATH` can point at an existing test deployment/browser.

Auth browser tests start an isolated Next.js dev server on port 3100 with a fake public project URL and intercept all Supabase calls in Playwright. They exercise recovery, expired-link handling, reauthentication/deletion, import failures/retries, shift corrections/conflicts, and same-user session events without contacting a real project. **These tests do not verify real SMTP or hosted GoTrue configuration.** No mock endpoints or bypasses are built into the application. Test output lives inside the ignored `.next/auth-tests` folder.

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs type checks, unit/database tests, the production build, audit, and both browser suites on pushes/PRs. It needs no repository secrets.

The checks cover validation boundaries, score weights/caps, non-identical recognition, journal-note exclusion, weekly aggregation, PostgreSQL row isolation/grants/constraints/cascade deletion, shift creation/persistence/filter/export/delete, profile updates, mobile navigation, nonce CSP, conflict-safe corrections, note preservation, search/date filters, pagination, and isolated print/PDF rendering.

## Next steps, not shipped

Verified platform integrations, human recognition outreach, backup-retention/privacy operations, and pilot feedback should precede later-phase features. Keep the original concept document for context, not as a mandate to prematurely build a marketplace or financing system.
