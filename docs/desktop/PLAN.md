# Lex Indiana → Desktop App: Audit & Plan

Status: **Phases 0–3 implemented** (see §7). Integration interfaces (Phase 4) are
not built yet. This document holds the audit, the
architecture decision, and the proposed structure.

Decisions taken (2026-11-19): SQLite everywhere · local demo sync server · Windows x64 +
dev shell first · keep login with a seeded demo account · DEMO and LIVE repositories are
separate and switchable without deleting either.

Date: 2026-11-19
Branch baseline: `a03d969` (tasks + calendar slice, 55/55 tests, typecheck + build green)

---

## 1. What the repository actually is

### Stack (verified from files, not assumed)

| Layer | Reality |
| --- | --- |
| Framework | Next.js **16.4.6**, App Router, React 19.1, TypeScript 5.9 (`tsconfig.json`), Tailwind 4 |
| Runtime | Node 22.x (`engines`, `.nvmrc`), single long-lived server (`next start`) |
| Database | Prisma 6.19.3 resolved from `^6.16.0`, **PostgreSQL** (`prisma/schema.prisma`) |
| Auth | Custom: bcryptjs + opaque session tokens (SHA-256 at rest) in an httpOnly `lex_session` cookie, `jose` for the 2FA challenge, `src/middleware.ts` gates all non-public routes |
| Files | `src/lib/storage.ts` — local filesystem **or** S3-compatible (AWS/R2), tenant-prefixed private keys, 25 MB cap, no blobs in the DB |
| Documents | `docxtemplater` + `pizzip` (.docx generation), `pdf-lib` (invoice PDF) |
| Tests | Vitest, **55 tests / 10 files**, real HTTP E2E, PostgreSQL-only, isolated schema `lex_indiana_test` |
| Hosting | `render.yaml` (Render web service + pre-deploy `db:deploy`), Render Postgres + R2/S3; one instance because the rate limiter is in-process |
| Extra | `freebuff.open-next.config.ts` + `freebuff.wrangler.jsonc` are Freebuff Sites publish artifacts; the app does **not** read D1/R2 bindings, it uses Prisma + `storage.ts` |

### Size and shape

- `src/` = **15,269 lines** across `.ts/.tsx`; 68 files matching `route.ts` / `page.tsx`.
- **56 source files import `@/lib/prisma`** and call `prisma.<model>` directly (~150 call sites, 19 models).
- `src/lib/data.ts` alone is 1,000 lines and is the de-facto data layer for pages.
- `prisma/schema.prisma`: **19 models, 10 enums**, 6 migrations. 13 of 19 models already carry `updatedAt`; `Session`, `Invitation`, `MatterAccess`, `InvoiceItem`, `AuditLog` do not.
- 24 environment variables referenced (DB, auth, storage/S3, registration mode, demo seed, 2FA issuer).

### What already works in our favour

1. **Server-side only data access.** Nothing in the browser talks to the DB; every mutation goes through `/api/*`. That is the clean seam a desktop shell and a sync engine both need.
2. **Cookies + same-origin API.** Running the app on `127.0.0.1:<port>` in Electron keeps auth, CSRF (`requireSameOrigin`) and middleware semantics identical — no rewrite of auth for desktop.
3. **String CUID ids generated client-side**, already unique across instances. Inserts are naturally conflict-free for sync.
4. **`updatedAt` on nearly every entity**, which is the basis for last-writer-wins conflict detection.
5. **Role/capability matrix and firm scoping are centralized** (`src/lib/permissions.ts`, `firmId` in every query), so sync can be per-firm without touching UI code.
6. **Pluggable storage driver already exists** (`STORAGE_DRIVER=local|s3`) — documents can be local-first with no schema change.

### What is missing for a desktop app

- No Electron/Tauri wrapper, no packaging, no app lifecycle, no menus, no single-instance handling.
- No local database: PostgreSQL requires a server; `scripts/dev-db.ts` embeds Postgres **for development only** and is not shippable inside an installer.
- No offline layer at all: no outbox, no change log, no tombstones, no sync cursor, no conflict record, no status surface.
- No environment/mode concept: offline vs online vs demo is not modelled anywhere; configuration is 24 env vars read from `.env`.
- No migration runner for a packaged app (today migrations run via Render pre-deploy).
- No desktop settings UI, no data-folder access, no backup/restore.
- No integration seams (Gmail/Outlook/Teams/calendar) — provider calls, if added now, would leak into routes.

### Breaking changes required (concrete, file-level)

| Issue | Location | Fix |
| --- | --- | --- |
| PostgreSQL-only datasource | `prisma/schema.prisma` | Provider change for the desktop build (see decision D1) |
| `@db.Decimal(10,2)` / `@db.Date` native types (15 attributes) | `prisma/schema.prisma` | Remove native type annotations; `Decimal`/`DateTime` still work on SQLite. App code already normalizes date-only values via `parseISODate`/`isoDate` |
| `mode: "insensitive"` (unsupported on SQLite) | `src/app/api/request/[token]/route.ts:65` | Compare normalized lowercase email in app code |
| `pg_advisory_xact_lock` raw SQL | `src/app/api/auth/register/route.ts:43` | Replace with a portable guard (unique index + `P2002` handling / serialized transaction) |
| Tests assume PostgreSQL schema + `prisma migrate deploy` | `tests/global-setup.ts`, `tests/helpers/database-url.ts`, CI workflow | Run against a temp SQLite file (or keep a PG test target for the server build) |
| `next start` / Prisma engines inside an asar archive | packaging | `asarUnpack` / `extraResources` for `.next`, `node_modules/.prisma`, `prisma/`; verify engine resolution in a packaged app |
| Writable paths | `src/lib/storage.ts` (`process.cwd()`), `STORAGE_ROOT` | Point at `app.getPath("userData")` in Electron; never write inside the app bundle |
| Secure cookies | `SESSION_COOKIE_SECURE` | `false` for `http://127.0.0.1` on desktop; unchanged for HTTPS hosting |
| In-process rate limiter | `src/lib/rate-limit.ts` | Fine for desktop; hosted sync target must stay single-instance (already documented) |

Confirmed **not** a problem: Prisma ≥ 6.2 supports `enum` and `Json` on SQLite (enum stored as TEXT, validated by Prisma), so the 10 enums and the two `Json?` fields (`AuditLog.metadata`, `IntakeSubmission.conflictMatches`) do not need to become strings. `Decimal` maps to `DECIMAL` on SQLite and still returns `Prisma.Decimal`, which the code already converts with `Number(...)`.

---

## 2. Architecture decision

The requirement is local-first + sync, so the desktop app must own a local database file.
There are three viable shapes; they differ in maintenance cost, not in UI work.

### Option A — SQLite everywhere (recommended)

One Prisma schema, one generated client, `provider = "sqlite"`. The desktop app uses a DB file in the OS app-data folder. The hosted demo/sync target runs the **same** build against its own SQLite file on a persistent disk (Render disk or any VM), which is compatible with the existing single-instance constraint. Sync is app-to-app over HTTP.

- ✅ One schema, one client, one code path, one test suite. No dual-provider drift.
- ✅ Prisma's built-in SQLite connector needs **no native npm module** (no `better-sqlite3` ABI rebuild in Electron). The Rust query engine ships as a platform binary that we unpack from the asar.
- ✅ Offline is the normal case, not a special mode.
- ⚠️ Gives up Render Postgres. For a law-practice demo with a handful of firms this is a non-issue; SQLite handles far more. Backups become file copies.
- ⚠️ Postgres-only features we use are exactly two (listed above) and both have small portable replacements.

### Option B — SQLite desktop + PostgreSQL hosted

Desktop runs SQLite; the existing Render/Postgres deployment stays as the online authority and sync server.

- ✅ Keeps the current production deployment untouched.
- ⚠️ Two Prisma schemas and two generated clients; every model change is made twice; 56 files still compile against one client alias at a time; CI must typecheck both targets.
- ⚠️ Sync has to translate between providers (Decimal/Date/enum handling), which is exactly where subtle bugs live.
- Cost: roughly double the schema/CI work and an ongoing drift risk for a demo product.

### Option C — Desktop only connects to Postgres

Electron wraps the UI and talks to the remote database.

- ❌ Not offline-capable, which is the core requirement. Rejected.

**Recommendation: Option A.** It makes the desktop app the primary artifact, keeps exactly one schema, and reduces "online" to "point the same app at a sync endpoint". Option B remains possible later because the sync contract is provider-agnostic JSON, not a database connection.

### Sync design (applies to A or B)

```
UI ──> /api/* (unchanged) ──> repository/prisma ──> local SQLite
                                     │
                                     └─ Prisma client extension: every mutation
                                        appends a SyncOperation row (same DB)

Sync worker (in-process, interval + manual "Sync now")
  1. push: POST /api/sync/push  { ops: [...] }   (batched, idempotent by op id)
  2. pull: GET  /api/sync/pull?since=<cursor>    (per-firm, ordered)
  3. apply remote rows, detect conflicts, advance cursor
```

- **Change capture without rewriting 56 files**: a `$extends` `$allModels.$allOperations` hook in `src/lib/prisma.ts` records create/update/delete into `SyncOperation`. No page or route changes.
- **Deletes**: today's APIs hard-delete. Sync needs tombstones, so delete operations enqueue a `SyncTombstone(entity, entityId, deletedAt)` before the row disappears.
- **Idempotency**: every queued op has a UUID; the server stores applied op ids and ignores repeats (retries are safe).
- **Conflict handling (basic, honest)**: compare the client's `baseUpdatedAt` with the server row's `updatedAt`. Equal → apply. Different → server wins by default and the losing local version is written to `SyncConflict` for review ("Keep mine" / "Keep theirs"). No field-level merge, no OT/CRDT — appropriate for a demo, and the failure mode is visible rather than silent.
- **Backstop**: nightly reconciliation compares `updatedAt > lastPull` per table, so a crash between a write and its outbox append cannot silently lose a change.
- **Status surface**: `/api/sync/status` → `offline | idle | syncing | error | synced at HH:mm`; sidebar chip + Settings panel with queue depth, last error, "Sync now".
- **Modes** (stored in `userData/desktop.config.json`, never in the DB):
  - `offline` — local DB only, worker disabled, chip reads "Offline".
  - `online` — worker enabled against `syncEndpoint`.
  - `demo` — local DB seeded with the synthetic Haynes firm; sync optional (default: a local demo target).
  - Switching modes **never touches data**; it only changes the endpoint/worker state.
  - A separate **Reset demo data** action takes a timestamped backup of the DB file first, then reseeds. That is the only destructive button.

### Desktop shell

Electron (the project is Next.js/Node, so Electron is the natural fit; Tauri would require a Rust sidecar to host Next anyway).

- **Dev**: Electron spawns `next dev` (or imports it) on an ephemeral port; hot reload works exactly as today. `npm run desktop:dev`.
- **Prod**: Electron starts the built Next server via `ELECTRON_RUN_AS_NODE=1` on a free port, then loads `http://127.0.0.1:<port>` in a `BrowserWindow`.
- **Security**: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, navigation allowlist to the local origin, external links via `shell.openExternal`, no remote content.
- **Preload** exposes only: app version, data folder, mode + endpoint, sync status, "sync now", "reset demo data", "open data folder". Everything else stays HTTP, so the same UI runs in a browser/deployment.
- **First run**: create `userData/data/`, run SQLite migrations, seed only in Demo mode.

---

## 3. Proposed file/folder structure

```
desktop/                          # Electron shell — no business logic
  main.ts                         # app lifecycle, single-instance lock, protocol/handlers
  windows.ts                      # BrowserWindow factory, security policy
  server.ts                       # resolve port, start Next (dev spawn / prod child), health wait
  preload.ts                      # contextBridge surface (typed, minimal)
  ipc.ts                          # channel names + handlers (mode, sync, reset, paths)
  config.ts                       # desktop.config.json read/write (atomic), schema-validated
  paths.ts                        # userData/data, sqlite file, storage root, backups
  migrations.ts                   # apply Prisma SQLite migrations on boot
  menu.ts                         # app menu (Reload, Data Folder, Sync Now, Reset Demo)
  security.ts                     # CSP, navigation allowlist, permission handlers
electron-builder.yml              # mac/win/linux targets, asarUnpack for .next/.prisma/prisma
scripts/
  desktop-dev.mjs                 # build-free dev loop: next dev + electron
  desktop-build.mjs               # next build + electron-builder
  desktop-smoke.mjs               # launch packaged app headless-ish, assert /login 200
src/lib/sync/
  index.ts                        # orchestrator (push → pull → apply), backoff
  types.ts                        # SyncOperation, SyncResult, ConflictRecord
  outbox.ts                       # enqueue, batch, retry, dead-letter
  transport.ts                    # HTTP transport interface + fetch implementation
  apply.ts                        # apply remote changes locally, tombstones
  conflicts.ts                    # detection + resolution
  cursor.ts                       # per-firm pull cursor
  status.ts                       # aggregated status for the UI/API
src/lib/desktop/
  mode.ts                         # offline | online | demo resolution (env + config)
  backup.ts                       # copy DB before destructive demo reset
src/lib/integrations/             # future external APIs — interfaces only in phase 4
  types.ts                        # EmailProvider, CalendarProvider, DocumentProvider
  registry.ts                     # resolves configured provider, null adapter by default
  null-provider.ts                # explicit "not configured" behaviour
src/app/api/sync/
  push/route.ts
  pull/route.ts
  status/route.ts
src/components/sync-status.tsx    # sidebar chip + "Sync now"
src/app/(app)/settings/desktop/page.tsx   # mode, endpoint, queue, reset (desktop only)
prisma/
  schema.prisma                   # portable models (+ SyncOperation/SyncCursor/SyncConflict/Tombstone)
  migrations/                     # SQLite migrations for desktop
  seed-desktop.ts                 # demo firm for first run
```

Modified (not moved): `src/lib/prisma.ts` (extension hook + adapter/config), `prisma/schema.prisma`,
the two Postgres-only constructs, `tests/global-setup.ts`, `package.json`, `README.md`, `DEPLOYMENT.md`.

---

## 4. First implementation steps (ordered, each independently verifiable)

**Phase 0 — Make the data layer portable (no UI change)**
1. Strip `@db.*` attributes; replace the insensitive filter and advisory lock.
2. Switch the schema to SQLite; generate a fresh init migration; run seed.
3. Point tests at a temporary SQLite file; keep `npm run typecheck`, `npm test`, `npm run build` green (all 55 tests).
   *Exit criteria: identical test results on SQLite, no behavioural change in the browser.*

**Phase 1 — Desktop shell, dev-first**
4. Add `desktop/` + `electron-builder.yml`; `npm run desktop:dev` opens the app with HMR.
5. First-run bootstrap: data dir, migrations, storage root, `AUTH_SECRET` generated per install.
6. Packaged build loads `/login`; docs for `npm run desktop:build`.
   *Exit criteria: packaged app launches offline, logs in, creates a matter, restarts with data intact.*

**Phase 2 — Sync engine**
7. Add sync tables + tombstone handling + Prisma extension capture.
8. `push` / `pull` / `status` routes; worker with backoff; per-firm scoping.
9. Status chip + "Sync now"; conflict list with keep-mine/keep-theirs.
   *Exit criteria: two clients, one edit each offline, both converge; a conflicting edit produces one visible conflict record, never silent loss.*

**Phase 3 — Modes and demo lifecycle**
10. `desktop.config.json` (offline/online/demo + endpoint), non-destructive switching.
11. Settings page: mode, endpoint, queue depth, last sync, backups, reset-with-backup.
12. Demo seed on first run in Demo mode.
    *Exit criteria: switching modes preserves all records; reset creates a backup then reseeds.*

**Phase 4 — Integration readiness**
13. `src/lib/integrations/types.ts` + registry + null adapter, with one documented example (calendar) that writes through the existing service layer, not the UI.
    *Exit criteria: adding a provider touches one folder; no UI component imports a provider.*

---

## 5. Risks / unknowns

- **Prisma engine inside a packaged app** is the most common Electron failure. Mitigation: built-in SQLite connector (no native module), `asarUnpack` for `.prisma`/`prisma`, `PRISMA_QUERY_ENGINE_LIBRARY` fallback, and a packaged smoke test in CI.
- **Next's server must run outside the asar**; if that proves brittle we can ship `.next` + production `node_modules` as `extraResources` rather than unpacking in place.
- **SQLite write concurrency**: one desktop process, WAL mode, `busy_timeout` — fine. The hosted sync target must not be scaled to multiple instances (already true today).
- **Hard deletes** currently exist in APIs; tombstones have to be added before sync is trustworthy.
- **Multi-firm sync**: sync must be per-firm and permission-checked server-side; a desktop user must not pull another firm's rows (same `firmId` scoping already used everywhere).
- **Signing/notarization** is out of scope for the first build; unsigned local builds are enough for demo testing.

---

## 6. Open decisions (blocking implementation)

1. **D1 — Database direction**: SQLite everywhere (A, recommended) vs SQLite desktop + Postgres hosted (B).
2. **D2 — Demo sync target**: local second instance (recommended) vs existing hosted deployment vs managed backend.
3. **D3 — Target OSes** for the first launchable build.
4. **D4 — Desktop auth**: keep the login screen + seeded demo account (recommended) vs auto-login a local profile vs both by mode.
5. **D5 — First-run data**: seed the synthetic Haynes firm in Demo mode (recommended) vs empty start vs prompt at first launch.

---

## 7. Implementation status

### Done — Phase 0 (portable data layer)

- `prisma/schema.prisma` targets **SQLite**; native PG attributes removed; 10 enums kept
  (Prisma ≥ 6.2 stores them as TEXT).
- New SQLite baseline migration `prisma/migrations/00000000000000_init`; the PostgreSQL
  history is archived in `prisma/legacy-postgres-migrations/` (not applied).
- `Contact.aliases` (PostgreSQL `String[]`) → JSON string + `src/lib/aliases.ts`.
- `mode: "insensitive"` filter replaced with app-level comparison.
- `pg_advisory_xact_lock` replaced with `src/lib/bootstrap-lock.ts`.
- `skipDuplicates` removed from the Haynes seed; `TRUNCATE` removed from tests.
- Tests run on a throwaway SQLite file (`.tmp-test/`), CI no longer provisions Postgres.
- Verified: typecheck, 59 tests, production build, live login against SQLite, demo seed.

### Done — Phase 1 (desktop shell)

- `desktop/main.mjs` (window, single-instance lock, menu, IPC), `desktop/preload.cjs`,
  `desktop/server.mjs` (embedded production server), `desktop/paths.mjs`,
  `desktop/config.mjs` (per-install `AUTH_SECRET`, atomic writes), `desktop/runtime.mjs`,
  `desktop/tasks.mjs` (migrations + first-run demo seed).
- Separate repositories: `<userData>/data/demo` and `<userData>/data/live`, selected by the
  **Environment** menu; switching restarts the embedded server in packaged builds.
- `npm run desktop:dev` (next dev + Electron, hot reload), `npm run desktop:smoke`
  (migrations/seed/server/login verified without a GUI), `npm run desktop:build`
  (Next build + electron-builder, Windows NSIS/portable).
- Demo seed bundle (`desktop/build/seed-haynes.mjs`) so the packaged app needs no TypeScript.

### Done — Phase 2 (sync engine)

- Sync tables: `SyncOperation` (local outbox **and** peer change feed, with `pushedAt`,
  `attempts`, `lastError`), `SyncCursor` per (firm, device), `SyncTombstone`, `SyncConflict`.
- Automatic capture: a `$extends` `$allModels.$allOperations` hook in `src/lib/prisma.ts`
  records create/update/upsert/delete/updateMany/deleteMany for `Firm`, `User`,
  `Membership`, `Contact`, `Matter`, `MatterContact`, `Task`, `CalendarEvent`, `Deadline`.
  Bookkeeping is enqueued on a serial queue instead of awaited in the hook, so Prisma batch
  transactions cannot deadlock. Sessions, invitations, audit logs, time entries, invoices and
  documents stay device-local.
- Payloads are JSON text (portable between SQLite and Postgres); user payloads never include
  `passwordHash` or `twoFactorSecret`, and mirrored accounts get an unusable local hash.
- `/api/sync/push` (idempotent by operation id, server-wins conflicts), `/api/sync/pull`
  (per-firm, excludes the caller's device, `since` cursor), `/api/sync/status`, `/api/sync/run`.
  Session auth or an `x-sync-secret` peer header; secret-authenticated calls must name a firm.
- Bootstrap: the first pass pushes a full parent-first snapshot; later passes push the outbox
  and pull the feed. A `retry` result holds the cursor so a child whose parent has not arrived
  is never dropped.
- Background worker (`src/instrumentation.ts` → `src/lib/sync/worker.ts`) with exponential
  backoff (15 s → 5 min) and `lastError` persisted on the cursor.
- Sidebar `SyncStatus` chip: offline/synced/pending/error, conflict count, last sync time,
  device id and **Sync now**.
- Desktop wiring: stable per-install `deviceId`, `sync.secret`, and
  `LEX_SYNC_ENABLED`/`LEX_SYNC_ENDPOINT`/`LEX_SYNC_SECRET`/`LEX_DEVICE_ID` in the embedded
  server env; changing sync settings via IPC restarts the backend in packaged builds.
- `npm run sync:smoke`: seeded client + empty local sync server, bootstrap, peer edit pull,
  server-wins conflict (recorded, not silent), offline error, app still usable.
- Verified: typecheck, 71 tests across 12 files, production build, `sync:smoke` 19/19.

### Done — Phase 3 (in-app desktop settings)

- `/settings/desktop` (`src/components/desktop-settings.tsx`), linked from **Settings** and the
  **Environment → Desktop settings…** menu. It talks only to the preload bridge; in a browser
  deployment it explains that the controls are desktop-only instead of failing.
- **Repository**: Demo / Live cards show which one is active, where its database lives, and
  switch via `desktop:set-environment`. Both databases stay on disk; the packaged app restarts
  its local server and reopens at sign-in. Dev mode reports that a restart is required.
- **Sync**: Offline / Online switch, endpoint field, peer secret field (write-only: the IPC
  state exposes `hasSecret`, never the value), "forget saved secret", and a Save that restarts
  the backend with the new `LEX_SYNC_*` environment.
- **This installation**: version, database path, backup folder, device id, open data folder.
- **Reset demo data**: only enabled in the Demo repository and only in the packaged app. The
  local server is stopped first, `desktop/backup.mjs` copies the SQLite file into
  `data/demo/backups/lex-indiana-<timestamp>.db`, then the database, journal files, uploads and
  seed marker are removed and the demo seed runs again. The backup path is shown afterwards.
  The Live repository is never reset from this page.
- Verified: typecheck, production build, `desktop:smoke` 28/28 (adds the LIVE bootstrap and
  sign-in, settings route render, and backup-before-clear checks).

### Producing a Windows build

On a Windows machine, the full path from a clean checkout:

```powershell
npm ci
npm run desktop:build -- --dir
```

`desktop:build` bundles the demo seed, runs the Next build and electron-builder, then the
layout check and the packaged smoke against `release/win-unpacked/resources/app`, so a broken
package fails the command instead of shipping.

`npm run desktop:installer` builds every target in `electron-builder.yml` and then asserts the
result with `scripts/desktop-installer-check.mjs`, which fails if either download is missing, is
not a real Windows executable, or is too small to contain the app:

- `release/Lex Indiana Setup <version>.exe` — NSIS installer. Per-user (`perMachine: false`), so it
  installs to `%LOCALAPPDATA%\Programs\Lex Indiana` with no admin prompt, offers the install folder,
  and creates a Start-menu shortcut. Uninstalling keeps the data folder.
- `release/Lex Indiana Portable <version>.exe` — one file, runs without installing.
- `release/win-unpacked/` — the tree both are packed from; the layout check and the packaged smoke
  run against `resources/app` inside it.

The exe, shortcut, installer and uninstaller icons all come from `assets/icon.ico`, derived from
`src/app/icon.svg`. `directories.buildResources` points at `assets/` rather than `build/` because
`build/` is gitignored Next output, so icons kept there never reach a release.

`scripts/desktop-metadata-check.mjs` parses the version and icon resources of every built exe and
compares them with `package.json`, `electron-builder.yml` and `assets/icon.ico`. It runs locally as
the last step of `desktop:installer` and in the Windows CI job, because a packaging run reports
neither: an unset `author` lets rcedit keep Electron's stub `GitHub, Inc.` publisher, and an icon
path that points nowhere is only a log line. The copyright line is deliberately not in the config:
with `copyright` unset electron-builder writes `Copyright © <build year> Haynes & Haynes Inc`, and
the check computes the same year, so it stays current without an edit every January.

`scripts/desktop-install-check.mjs` is the only check that runs an installer. On Windows it
installs `Lex Indiana Setup <version>.exe` with `/S` — per-user, so no admin prompt — asserts the
app landed in `%LOCALAPPDATA%\Programs\Lex Indiana` with its uninstaller, resolves the Start-menu
shortcut through COM and requires it to target that exe, checks the installed exe is still the
build packaging produced, launches it and waits for the demo repository and settings file, then
uninstalls silently and requires the install folder and shortcuts to be gone while the data folder
still holds a marker written after launch, the unchanged database and `desktop.config.json`. It
refuses to run where the app is already installed, because a preinstalled copy would hide whether
uninstalling keeps user data. It runs as a second job in `package-windows.yml`, after packaging,
so it installs the artifact the packaging job built instead of building Windows twice; CI runs it,
and so does a release tag.

Neither installer is
code-signed — no certificate is available — so Windows SmartScreen warns on the first run; **More
info → Run anyway** is the expected path for an internal build. Repositories and uploaded documents
stay in `%APPDATA%\lex-indiana\data\`, outside the install folder.

The layout check judges the tree against the platform and architecture it was built for
(`--platform`/`--arch`, or the electron-builder output directory) and matches Prisma's engine
file name against that target, so a cross-built `--win` package holding a Linux engine, or an
arm64 engine in an x64 package, fails locally and in CI rather than at first launch.
Cross-building a `--win` package on macOS or Linux also fails unless Prisma's `binaryTargets`
includes `windows`; the Windows runner is the supported way to produce it.

Without a Windows machine, and without cutting a release, use the manual workflow:
**Actions → CI → Run workflow**, choose the branch, and tick **Skip the Linux verify job and
only build the Windows artifact**. The `package-windows` job builds with
`electron-builder --win --x64`, verifies the layout, smokes the packaged app, checks the installers
and uploads two artifacts (kept 7 days): `lex-indiana-windows-installers` — the setup and portable
exe to hand to a Windows user — and `lex-indiana-windows-unpacked` (unzip it and run
`Lex Indiana.exe`). Neither is signed, so Windows shows a SmartScreen prompt on first run.

The packaging job lives in `.github/workflows/package-windows.yml` and is called by both `ci.yml`
and `release.yml`, so there is one definition of a good Windows build rather than a second copy that
can drift.

### Releasing

Bump `version` in `package.json`, merge to `main`, then tag the merge commit:

```
git tag v1.0.1
git push origin v1.0.1
```

The tag push runs `.github/workflows/release.yml`, which on its own:

1. fails in seconds if the tag is not `v<package.json version>` or does not point at a commit on
   `main`, before any Windows build starts;
2. runs the same packaging job CI runs, checks included — layout, packaged-app smoke, installers,
   exe metadata, and an install/launch/uninstall of the NSIS build;
3. publishes a GitHub Release named after the tag with both installers attached, checksums in the
   notes. `gh release upload` turns spaces in asset names into dots, so the served files are
   `Lex.Indiana.Setup.<version>.exe` and `Lex.Indiana.Portable.<version>.exe`.

Re-running a tag replaces that release's assets and notes instead of failing. Nothing needs to be
downloaded from an artifact or uploaded by hand, and the release does not expire the way the 7-day
artifact does.

### Not yet built

- **Conflict review UI**: conflicts are recorded and counted, but the keep-mine/keep-theirs
  screen is not built.
- **Scheduled backups**: backups are created before a demo reset only; no automatic cadence.
- **Phase 4 — integration interfaces**: `src/lib/integrations/` provider contracts.
- **Verification gap**: the Electron binary could not be downloaded in the build sandbox and
  there is no display, so the GUI window and the packaged installer are **untested**. The
  server/migration/seed path they depend on is covered by `desktop:smoke`.
