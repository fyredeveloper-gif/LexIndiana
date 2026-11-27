# Lex Indiana — Legal Practice Management & Client Intake

A multi-tenant practice management platform built for Indiana law firms. It covers client
intake and conflict checking, matter management with Indiana cause numbers, a Trial Rule 6
deadline calculator, timekeeping, PDF invoicing, and `.docx` document assembly — all scoped
to the signed-in user's firm, with attorney, paralegal, practice-manager, and consultant roles.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · SQLite · Prisma ·
pdf-lib · docxtemplater · local or S3-compatible object storage · Electron desktop shell

---

## 1. Quick start

### Prerequisites

- Node.js 22.x — pinned in `.nvmrc`; CI reads the same file
- No database server is required: the app uses SQLite (a local file)
- `openssl` (optional, only to generate `AUTH_SECRET`)

### Install and configure

```bash
nvm use            # reads .nvmrc (Node 22)
npm install
cp .env.example .env

# Generate a signing secret and paste it into AUTH_SECRET
openssl rand -base64 48
```

### Create the local database

Nothing to install or start. `DATABASE_URL="file:./dev.db"` in `.env` resolves to
`prisma/dev.db`, which is created by the migration step. To move it, change the path in
`DATABASE_URL` (a `file:` URL, absolute or relative to `prisma/`).

### Migrate, seed, run

```bash
npm run db:deploy      # applies prisma/migrations to the SQLite file
npm run db:seed        # optional five-role demo workspace
npm run dev            # http://localhost:3000
```

### Desktop app (Windows-first)

The same codebase runs as an Electron app with its own SQLite repository per environment.

```bash
npm run desktop:dev       # next dev + Electron window, hot reload
npm run desktop:smoke     # verifies migrations, demo seed, embedded server and login
npm run desktop:build     # Next build + electron-builder (unpacked app in release/)
npm run desktop:installer # NSIS installer + portable exe in release/, then checks them
npm run sync:smoke        # two instances: bootstrap, peer edit, conflict, offline
```

`desktop:installer` produces `release/Lex Indiana Setup <version>.exe` (per-user install, no admin
prompt, selectable folder, Start-menu shortcut) and `release/Lex Indiana Portable <version>.exe`
(runs without installing). Neither is code-signed, so Windows SmartScreen warns on first launch.
Both share the data folder, so a portable run and an installed run see the same repositories.
The app icon is `assets/icon.ico`, derived from the mark in `src/app/icon.svg`.

Sync is off until a target is configured. Point a desktop build at a demo sync server with
`LEX_SYNC_ENABLED=1`, `LEX_SYNC_ENDPOINT=http://127.0.0.1:<port>`, `LEX_SYNC_SECRET` set to
the peer's `SYNC_SECRET`, and a stable `LEX_DEVICE_ID`. The sidebar chip shows
Synced/pending/error with a **Sync now** button; unresolved conflicts are counted there.
Changes to staff, contacts, matters, tasks, calendar events and deadlines sync automatically
(never sessions, invitations, audit logs, time entries, invoices or documents).

On first launch the DEMO repository is created at
`<userData>/data/demo/lex-indiana.db` and seeded with the synthetic Haynes firm. The LIVE
repository (`<userData>/data/live/lex-indiana.db`) is separate and starts empty; switching
between them from the **Environment** menu never deletes either one.

Demo sign-in for the desktop DEMO repository: `quentin@lexindiana.test` / `IndianaLaw2026!`
(synthetic data only; override with `LEX_DEMO_PASSWORD` before first launch).

**Settings → Desktop settings** (or **Environment → Desktop settings…**) switches between the
Demo and Live repositories, turns sync Offline/Online and edits the endpoint and peer secret,
and resets the demo data. Switching never deletes records; a reset copies the demo database to
`data/demo/backups/` before clearing it, and is only offered in the packaged app while the Demo
repository is active.

Demo credentials (created by `db:seed`; every account uses the same password):

| Email | Role |
| --- | --- |
| `demo@lexindiana.test` | Owner / managing attorney |
| `maria@lexindiana.test` | Attorney |
| `tessa@lexindiana.test` | Paralegal |
| `renee@lexindiana.test` | CLM / practice manager |
| `alan@lexindiana.test` | Consultant (one shared matter) |

Password: `IndianaLaw2026!`

The demo firm contains 6 matters, 10 contacts, two intake submissions (one clear, one conflict
flag), an active deadline schedule, unbilled time, one sent invoice, audit history, and the
sample pleading template.

### Other commands

```bash
npm run typecheck      # tsc --noEmit
npm test               # Vitest integration + permission tests
npm run test:watch     # Vitest in watch mode
npm run test:e2e       # HTTP login + invitation acceptance only
npm run build          # prisma generate + next build
npm start              # serve the production build
npm run db:deploy      # prisma migrate deploy (production)
npm run check:prod-env # validate required production env before a release
npm run db:studio      # Prisma Studio
```

### Automated tests

`npm test` runs against a throwaway SQLite file (`.tmp-test/lex-indiana-test.db`
by default), never your development database. Global setup runs
`prisma migrate deploy`, then each run clears its own test data. The suite covers:

- the complete staff-role capability matrix;
- consultant matter isolation across matters, contacts, deadlines, time, invoices,
  and intake;
- owner/attorney admin boundaries and intake conversion/decline decisions;
- invitation acceptance, role fixing, replay rejection, expiry, and escalation attempts;
- cross-firm lookups and API writes returning 404.

The tests create their own firms, users, matters, invoices, invitations, and intakes,
so no demo seed is required and no database server has to run. `TEST_DATABASE_URL`
can point the suite at a different SQLite file; it must be a `file:` URL.

One test builds an isolated production app into `.next-e2e`, serves it with
`next start` on an ephemeral port, and then signs in through `/api/auth/login` with a
real password. It checks the HTTP-only session cookie, creates an invitation, accepts
it without a cookie, and uses the resulting session to call a role-gated API. This
covers the real cookie/session path that the route-handler tests mock.

`.github/workflows/ci.yml` uses the Node version from `.nvmrc` and runs typecheck,
the full test suite, and the production build on every push and pull request. No
database service container is needed.

---

## 2. Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | SQLite file URL, for example `file:./dev.db` (resolved from `prisma/`) |
| `AUTH_SECRET` | yes | 32+ character secret used to sign the short-lived 2FA challenge token |
| `APP_URL` | yes (production) | Public origin, used for `Secure` cookie inference and absolute invitation/intake links |
| `SESSION_COOKIE_SECURE` | no | `true` forces the `Secure` cookie attribute behind HTTPS |
| `TWO_FACTOR_ISSUER` | no | Label shown in authenticator apps (default `Lex Indiana`) |
| `REGISTRATION_MODE` | no | `bootstrap` (default: first firm only), `open`, or `closed` |
| `STORAGE_DRIVER` | yes | `local` or `s3` |
| `STORAGE_ROOT` | local only | Filesystem root (default `./storage`) |
| `MAX_UPLOAD_MB` | no | Upload cap, default 25 |
| `S3_BUCKET` / `S3_REGION` / `S3_ENDPOINT` | s3 only | Bucket and endpoint (AWS, R2, MinIO, B2) |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | s3 only | Credentials (or use an instance role) |
| `S3_FORCE_PATH_STYLE` | no | `false` for AWS S3 (Render default); `true` for R2/MinIO |
| `S3_SSE` | no | `AES256` by default; set `none` for R2 if it rejects the header |

Never commit `.env`. `.env.example` documents every variable.

---

## 3. Multi-tenancy and security model

### Tenant isolation contract

The **firm** is the tenant. Every firm-owned table carries a required `firmId`:

`Contact`, `Matter`, `MatterContact`, `TimeEntry`, `Invoice`, `Deadline`,
`DocumentTemplate`, `MatterDocument`, `IntakeSubmission`.

`userId` on those rows is attribution (who created the record or performed the work), never an
access boundary. Reads and writes go through `src/lib/data.ts` and the route handlers, which
take `firmId` from the caller's **Membership** — never from a request body or query parameter.
Foreign keys (client, matter, template) are verified to belong to the same firm before linking.
Consultants are further restricted to matters with an explicit `MatterAccess` row.

Authorization is capability-based (`src/lib/permissions.ts`). Pages and API routes both call
`can(role, capability)`; the data layer independently scopes every query by firm. Removing a
role check from a page cannot widen a query, and guessing another firm's record id returns 404.

### Authentication

- Email + password, bcrypt cost 12, minimum 10 characters with a letter and a number.
- Opaque 256-bit session tokens; only a SHA-256 digest is stored in `Session`. Logout deletes
  the row, so sessions are revocable.
- Cookies are `httpOnly`, `SameSite=Lax`, `Path=/`, 7-day expiry, and `Secure` in HTTPS
  deployments.
- Optional TOTP two-factor authentication (RFC 6238) with QR enrollment, a ±30s window, and
  password confirmation required to disable. A successful password step issues a signed
  10-minute challenge cookie; no full session exists until the code is verified.
- Login and registration are rate-limited per email/IP (in-process; use Redis for
  multi-instance deployments).
- All mutating API routes reject cross-origin requests via an `Origin`/`Host` check.

### File storage isolation

Keys are deterministic and firm-prefixed:

```
firms/{firmId}/matters/{matterId}/{timestamp}-{filename}   # matter uploads + generated docs
firms/{firmId}/templates/{timestamp}-{filename}            # template library
```

- `assertOwnedKey()` rejects any key that does not start with `firms/{session firm id}/` (and
  any key containing `..`), so a tampered database row cannot read another tenant's file.
- Local paths are resolved and verified to stay inside `STORAGE_ROOT`.
- Stored filenames are sanitized; path separators and control characters are stripped.
- Every download is served by an authenticated route handler after an ownership lookup; no
  bucket or directory is exposed directly. Responses are `Cache-Control: private, no-store`.
- S3 mode streams objects through the same authorized route — there are no pre-signed URLs
  that would bypass the check.

Additional hardening: `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, disabled
camera/mic/geolocation, bounded request bodies, and uploaded `.docx` files validated as real
OOXML packages before they are stored.

---

## 4. Features

### Contacts and conflict checking

Contacts are typed as **Client**, **Opposing Party**, **Opposing Counsel**, or **Witness**, with
aliases, organization, address, phone, email, and free-text notes. `/conflicts` searches names,
aliases, organizations, emails, notes, matter titles, cause numbers, and matter notes inside
the signed-in workspace, then links each hit to the matter and role where it appears.

### Public client intake

Each firm can publish one private intake link at `/request/{token}`. Tokens are 192-bit
secrets, owned by the firm, and rotatable by the owner under **Firm → Public client intake**.
They never expose matters, contacts, or files.

- The form captures name, email, phone, organization, Indiana county, practice area, a
description, opposing parties, and referral source, with a required acknowledgment that no
attorney-client relationship is created.
- Submission runs the workspace conflict screen **before** opening anything, then creates the
client contact, an **INTAKE** matter, and an `IntakeSubmission` record in one transaction.
- If the email already belongs to a client, that contact is reused and excluded from its own
conflict check.
- A conflict match never blocks the submission. It sets the submission to `REVIEW`, stores a
snapshot of the matching contacts and matters, and surfaces a warning in the intake inbox and
on the matter. The applicant always sees the same neutral confirmation and reference code.
- The intake inbox at `/intake` shows conflict badges, assignment, and workflow status
  (`NEW`, `CONTACTED`, `CONVERTED`, `DECLINED`). Owner, attorneys, paralegals, and practice
  managers can triage; only the owner and attorneys can convert or decline.
- Abuse controls: per-visitor and per-firm rate limits, a hidden honeypot field, strict
  length limits, no public file uploads, and salted-hash-only IP logging. The public page is
  `noindex` and invalid tokens return 404.

### Registration gate

`REGISTRATION_MODE` controls account creation:

- `bootstrap` (default) — `/register` works only while no firm exists, so the
  first owner can set up the deployment; it closes automatically afterward.
- `open` — anyone can create a new firm.
- `closed` — registration is disabled.

The login page and `/register` page follow the same server-side policy as the
registration API.

### Staff roles, membership, and invitations

A firm has five fixed roles, enforced by the capability map in `src/lib/permissions.ts`:

| Capability area | Owner | Attorney | Paralegal | CLM | Consultant |
| --- | --- | --- | --- | --- | --- |
| Matters | Full | Full | Read/write | Read-only | Assigned, read-only |
| Contacts | Full | Full | Read/write | Read-only | Parties on assigned matters |
| Conflict checker | Full | Full | Run/view | Intake flags only | No |
| Intake inbox | Full | Full | Triage | Triage | No |
| Convert / decline intake | Yes | Yes | No | No | No |
| Intake link & rotation | Yes | No | No | No | No |
| Deadlines | Full | Full | Read/write | Read-only | Assigned, read-only |
| Tasks / calendar | Full | Full | Read/write | Read-only | Assigned matters, read-only |
| Time | All + edit | All + edit | Own | All read, own entry | No |
| Invoices | Full | Full | No | Full | No |
| Templates / documents | Full | Full | Write | Read | Assigned downloads |
| Firm profile | Full | No | No | Edit | No |
| Members, roles, audit | Full | No | No | Roster/audit read | No |

- Exactly one owner per firm. Ownership is transferred deliberately and only to an attorney;
  the previous owner becomes an attorney. Owners cannot change their own role or remove
  themselves.
- The owner invites staff by creating a single-use `/join/{token}` link (7-day expiry). No email
  is sent; the raw link is shown once, and only its SHA-256 hash is stored. The invited email is
  authoritative and the role is fixed at invite time — accepting cannot escalate it.
- One firm per user in this version. An invitation to someone who already belongs to a firm is
  refused.
- Consultants require an explicit per-matter grant (owner/attorney on the matter page). They see
  only those matters, documents, deadlines, tasks, and calendar events, and cannot reach contacts,
  conflicts, intake, time, invoices, or firm settings.
- `AuditLog` records membership changes, ownership transfer, intake status/assignment/notes,
  intake token rotation, conflict decisions, and consultant access grants. It is append-only
  in the app and visible to the owner and practice manager.

### Matters

Each matter links to a primary client (a `CLIENT` contact) and stores the Indiana cause number
(`49D01-2601-CT-001234`), county, court, practice area, status (`INTAKE`, `ACTIVE`, `PENDING`,
`CLOSED`), and notes. Additional parties are linked with `MatterContact` and a role.

### Indiana deadline calculator

Implemented in `src/lib/deadlines.ts` against the **Indiana Rules of Trial Procedure as amended
effective July 1, 2026**:

- The day of the triggering event is excluded; the last day is included (T.R. 6(A)).
- Periods **shorter than seven days** skip intermediate weekends and legal holidays.
- **Personal service** and **IOJA e-service** add no days; **certified/first-class mail** adds
  three days (T.R. 6(G), formerly 6(E)).
- Due dates landing on a Saturday, Sunday, or Indiana legal holiday roll forward to the next
  open day — including observed holidays.
- Indiana holidays follow **Ind. Code § 1-1-9-1**: New Year's Day, MLK Day, Lincoln's Birthday,
  Washington's Birthday, Good Friday (computed), Memorial Day, Independence Day, Labor Day,
  Columbus Day, Primary/General Election Day (even years), Veterans Day,
  Thanksgiving, and Christmas. Saturday holidays are observed the preceding Friday and Sunday
  holidays the following Monday.
- A live preview shows the trigger date, prescribed period, mail addition, unadjusted last day,
  the final date, and every rolled date with its reason.
- Deadlines export as an RFC 5545 `.ics` calendar (all-day events with a one-day reminder),
  either workspace-wide or per matter.

Presets ship for responses to pleadings and motions, replies, written discovery, jury demand,
motion to correct error, and notice of appeal. The citation for each preset is retained on the
saved deadline.

> The calculator models statewide rules only. Local rules, case-management orders, clerk
> closures, and election-day variations must still be confirmed. It is not legal advice.

### Time and invoicing

- One running timer per workspace, started from the matter page, time page, or sidebar, with
  live elapsed time and stop-and-save.
- Manual entries support date, tenths of an hour, per-entry rate (defaults to the profile
  rate), and billable/non-billable.
- Invoices are generated from selected unbilled entries in a transaction; entries are locked
  to the invoice so nothing can be double-billed. Line items are an immutable snapshot of
  date, description, hours, rate, and amount.
- PDF invoices (pdf-lib) carry the firm header, attorney name and Indiana attorney number,
  bill-to block, matter/cause number, itemized table with page breaks, totals, notes, and a
  balance-due block.
- Invoice status (`DRAFT`, `SENT`, `PAID`) drives the outstanding/collected dashboard figures.

### Document assembly

Upload `.docx` templates with `{{placeholder}}` tags. Generation merges matter, client, party,
attorney, firm, and date data, then writes the result to the matter's isolated folder.
Supported tags are listed on the Templates page and in `src/lib/docx.ts`.

The **Install sample pleading** button builds a valid `.docx` Entry of Appearance entirely in
code, so document assembly can be exercised without supplying a file.

---

## 5. Database

SQLite, one file per environment. The schema lives in `prisma/schema.prisma`; migrations in
`prisma/migrations` are SQLite migrations. The previous PostgreSQL migration history is kept
for reference in `prisma/legacy-postgres-migrations/` and is not applied.

```bash
npx prisma migrate dev --name <change>   # create a migration in development
npx prisma migrate deploy                # apply migrations (dev, CI, desktop, hosted)
npx prisma studio                        # inspect data
```

SQLite has no array or enum column types: enums are stored as TEXT and validated by Prisma,
and `Contact.aliases` is a JSON-encoded string handled by `src/lib/aliases.ts`.

The server switches the file to WAL mode and a 5 s busy timeout on startup
(`src/lib/sqlite.ts`), so the background sync worker and interactive writes can overlap
without `database is locked` failures. Commits can still sit in the `-wal` file, so include
it whenever a database file is copied or restored by hand.

Key relationships: `Firm 1—* Membership *—1 User`, `Firm 1—* Matter 1—*
TimeEntry/Deadline/Invoice/MatterDocument`, and `Invoice 1—* InvoiceItem`.
`TimeEntry.invoiceId` is `SetNull` if an invoice is removed; `Invoice.matterId` is `Restrict`
so matter deletion cannot orphan billing records. `MatterAccess` is the consultant allow-list.

Existing installations migrate by promoting each user to the owner of a new firm and
backfilling every tenant row's `firmId`; `prisma/migrations/20261118174500_firm_membership`
contains that backfill.

`Session` rows are pruned on each successful login. Expired sessions are rejected on read.

---

## 6. Production deployment

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the full production runbook, host
configuration, and launch checklist.

1. Point `DATABASE_URL` at a SQLite file on a **persistent disk** (for example
   `file:/var/data/lex-indiana.db`) and mount that disk at the same path.
2. Set `AUTH_SECRET` (32+ random bytes), `APP_URL=https://your-domain`, and
   `SESSION_COOKIE_SECURE=true`.
3. Choose storage:
   - **S3-compatible** (recommended): set `STORAGE_DRIVER=s3`, bucket, region, endpoint, and
     credentials. Grant only `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` on the
     bucket prefix. Keep the bucket private — objects are never served directly.
   - **Local** (default for the hosted demo): mount a persistent volume at `STORAGE_ROOT`
     and back it up together with the SQLite file.
4. Validate the production environment and run migrations during release:
   `npm run check:prod-env && npm run db:deploy`, then `npm run build && npm start`.
5. Terminate TLS at your proxy and forward `X-Forwarded-For` so login rate limiting sees real
   client addresses. Allow request bodies at least as large as `MAX_UPLOAD_MB`.
6. Back up the database and object storage together; invoice line items and document records
   reference each other.
7. For multiple app instances, move the rate limiter to Redis or a database table.

---

## 7. Project structure

```
prisma/
  schema.prisma          tenant-scoped data model
  migrations/            committed SQL migrations
  seed.ts                demo workspace
scripts/
  desktop-dev.mjs        next dev + Electron window
  desktop-smoke.mjs      migrations, seed, embedded server, login
  sync-smoke.mjs         two-instance sync bootstrap/conflict/offline test
src/
  app/
    (auth)/              login, registration, 2FA challenge
    (app)/               dashboard, matters, contacts, conflicts, intake, tasks,
                         calendar, deadlines, time, invoices, templates, firm, settings
    request/[token]/     public, no-index client intake form
    join/[token]/        public staff invitation acceptance
    api/                 auth, settings, contacts, matters, parties, access, time,
                         invoices (+ PDF), deadlines (+ ICS), tasks, calendar,
                         templates, documents, request/[token] (public intake),
                         intake, firm (members, invitations, ownership), join/[token]
  components/            UI primitives, app shell, timer, forms
  lib/
    auth.ts               sessions, bcrypt, 2FA challenge cookie, firm/role context
    permissions.ts        staff role capability matrix
    firm.ts               membership, invitations, audit, matter access
    data.ts               firm-scoped, role-aware queries
    deadlines.ts          Trial Rule 6 engine + Indiana holidays
    storage.ts            local/S3 driver with key guards
    docx.ts, invoice-pdf.ts, ics.ts, merge.ts
    validation.ts         zod schemas for every payload
  middleware.ts           cookie gate for authenticated pages
```

---

## 8. Known limitations

- Deadline logic covers statewide Trial Rule 6 only; local rules and court closures are not
  modelled, and election-day observance varies by county.
- Email delivery (invoice sending, password reset, new-intake alerts) is not included; new
  submissions appear in the in-app intake inbox. Invoices are downloaded as PDFs.
- Payments are not processed; invoice status is tracked manually.
- Login and public-intake rate limiting is per process and resets on restart. Move it to Redis
  for multi-instance deployments.
- Public intake submissions are self-reported and are not identity-verified; conflict screening
  is a firm-scoped name/alias/notes match, not a substitute for a formal conflicts policy.
- One firm per user and one owner per firm. Multi-firm switching, co-owners, custom roles, and
  per-matter ethical walls for staff (beyond consultant grants) are not implemented.
- Invitations are copyable links; there is no email delivery, so the owner must send the link.
  Removing a member ends workspace access immediately but does not delete records they created.
- The audit log covers security- and ethics-sensitive events, not every record edit. It is not
  cryptographically chained and has no external retention/export job.
- The desktop shell and its per-environment SQLite repositories require the packaged
  Electron app; the hosted deployment runs a single SQLite file on a persistent disk.
