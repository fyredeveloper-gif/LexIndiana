# Production deployment plan

This is the production runbook for Lex Indiana. It assumes the current stack:
Next.js 16 running as a long-lived Node 22 process, PostgreSQL, Prisma, and
private S3-compatible document storage.

**No production deployment has been performed.**

## 1. Recommended hosting shape

Use a managed container/PaaS that runs a persistent Node process, with managed
PostgreSQL in the same region and a private object bucket:

| Layer | Recommendation | Why |
| --- | --- | --- |
| App | Render Web Service (paid, one instance) | Runs `next start` on Node 22, supports a pre-deploy migration command, health checks, custom domains, and TLS without a serverless request-body cap. |
| Database | Render Postgres (paid) | Private in-region connection, continuous backups/PITR on paid plans, no separate database vendor to wire up. |
| Files | Private AWS S3 bucket (or Cloudflare R2) | The app already supports S3-compatible storage. Local disk is not durable on an app instance and is not suitable for production. |
| DNS/TLS | Custom domain on Render | Managed certificate and HTTPS termination. |

Do not use Vercel for this build as-is: its serverless request-body limit is
well below the app's supported 25 MB document uploads. Moving there would
require direct-to-S3 uploads and an external rate limiter, which are not
implemented.

Cloudways is a reasonable fallback if you prefer a managed VPS, but you would
own PostgreSQL patching, backups, process supervision, and TLS. It is more
operational work than the Render shape above.

## 2. Service configuration

Create one paid web service and one paid PostgreSQL instance in the same region.
[`render.yaml`](render.yaml) contains the web-service settings; it intentionally
leaves the database and secrets to the dashboard because those are account and
region-specific. Provision the database and private bucket first.

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Node version | `22.23.5` (from `.nvmrc`; set `NODE_VERSION=22.23.5` explicitly if the platform does not read it) |
| Build command | `npm ci --include=dev && npm run build` |
| Pre-deploy command | `npm run check:prod-env && npm run db:deploy` |
| Start command | `npm start` |
| Health check path | `/login` |
| Instances | **1** until the rate limiter is moved out of process |
| Auto-deploy | `main` only after CI is green |

`npm run build` temporarily removes local `.env*` files, runs `prisma generate`
and `next build`, then restores them. This prevents OpenNext from copying local
development credentials into the Worker bundle; real deployment values must be
provided through the hosting provider's environment/secrets. Keep
`--include=dev` in the build command: TypeScript, Tailwind, and PostCSS are
devDependencies, and a production `NODE_ENV` must not strip them before the
build.

The pre-deploy command runs on a separate release instance. It checks the
production environment first, then applies migrations. It only needs the
database connection; it does not use local storage. With S3 storage, this is
safe. Run `npm run check:prod-env` to reproduce the check locally with your
production environment loaded.

## 3. Environment variables

Set these in the hosting provider's secret/environment store. Never commit a
real `.env`.

### Required

| Variable | Value / notes |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. Use the provider's **internal/private** URL for the app when available. If connecting over the public internet, require TLS (`sslmode=require` or stricter). |
| `AUTH_SECRET` | At least 32 random characters, e.g. `openssl rand -base64 48`. Used for the 2FA challenge cookie and intake IP hashing. Changing it invalidates pending 2FA challenges. |
| `APP_URL` | Exact public origin, no trailing slash, e.g. `https://app.yourfirm.com`. Required for secure cookies and for invitation/intake links. |
| `SESSION_COOKIE_SECURE` | `true` in production. |
| `STORAGE_DRIVER` | `s3`. |
| `MAX_UPLOAD_MB` | `25` unless you deliberately change the product limit. |
| `NODE_ENV` | `production` at runtime. |
| `S3_BUCKET` | Private bucket name. |
| `S3_REGION` | Bucket region. |
| `S3_ACCESS_KEY_ID` | Credential with access only to the app's bucket prefix. |
| `S3_SECRET_ACCESS_KEY` | Secret for the same credential. |
| `REGISTRATION_MODE` | Optional; defaults to `bootstrap` (first firm only). Use `open` only for intentional public signup, or `closed` to disable registration. |

### Storage endpoint settings

**AWS S3**

```text
S3_ENDPOINT=            # leave blank
S3_FORCE_PATH_STYLE=false
S3_SSE=AES256           # default
```

`render.yaml` sets these AWS-safe values explicitly. For R2, edit `render.yaml`
(not only the dashboard, which can be overwritten by blueprint sync): set
`S3_FORCE_PATH_STYLE` to `true`, `S3_SSE` to `none`, set `S3_REGION=auto`, and
add `S3_ENDPOINT`. The blueprint comments call this out.

**Cloudflare R2**

```text
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_FORCE_PATH_STYLE=true
S3_SSE=none
```

Optional: `TWO_FACTOR_ISSUER` (default `Lex Indiana`), `S3_SSE=none` only for
providers that reject the AES256 header.

## 4. Database and migrations

1. Create the production database in the same region as the app.
2. Back up or snapshot it before every schema-changing release. Render's paid
   plans provide point-in-time recovery; export a logical backup before the
   first release and keep a scheduled off-provider backup.
3. Apply migrations only through `npm run db:deploy` in the pre-deploy step.
   Do not run `prisma migrate dev`, `db:push`, or `db:seed` in production.
4. Do not run `npm run db:seed`. It creates demo users and demo firm data.
5. With the default `REGISTRATION_MODE=bootstrap`, `/register` is available
   only while no firm exists. Register the first owner immediately after the
   first deploy; that creates the firm and OWNER membership in one transaction. Concurrent bootstrap attempts are
   serialized with a PostgreSQL advisory lock, so only one firm can be created;
   registration then closes automatically. Use `REGISTRATION_MODE=open`
   only if public firm creation is intended, or `closed` to disable it entirely.
   The API enforces the same policy as the page.

For a stronger privilege split, use a migration role for the pre-deploy step
and a runtime role with DML-only access for the web service. If you do this,
grant the runtime role privileges on existing and future tables before the
first deploy. A single owner role is acceptable for the initial launch but is
not the long-term least-privilege configuration.

Keep migrations backward-compatible during a rolling release:

1. Add nullable columns/tables first.
2. Deploy application code that tolerates both shapes.
3. Backfill.
4. Remove old columns in a later release.

Prisma migrations are forward-only; rollback is application rollback plus a
database restore if a bad migration cannot be reversed safely.

## 5. File storage

- Keep the bucket private. Block all public access. Do not add a public bucket
  policy or a public CDN in front of it.
- Grant the app credential only `s3:GetObject`, `s3:PutObject`, and
  `s3:DeleteObject` under `firms/*`. The app does not need bucket listing or
  administrative permissions.
- Enable default encryption at rest and TLS in transit. For regulated client
  documents, enable bucket versioning and a retention/lifecycle policy.
- Matter `.docx` uploads and template uploads are validated as OOXML packages
  before they reach storage; a renamed non-Word file is rejected with 415.
- There is no CORS requirement: uploads and downloads pass through authenticated
  Next.js route handlers, never directly from the browser to the bucket.
- Back up object storage together with PostgreSQL. Invoice items and document
  rows reference each other, so a database-only restore can leave broken links.
- Use a separate backup bucket/credential for database dumps and object
  replication; do not give the application credential access to backups.

## 6. Domain, TLS, and edge behavior

1. Add the custom domain in Render and create the DNS records it specifies.
2. Wait for the managed certificate to become active before testing cookies.
3. Set `APP_URL` to the final HTTPS origin before the first login. Otherwise
   invitation and intake links point at `localhost` and cookies may lack the
   `Secure` attribute.
4. HSTS is emitted when `APP_URL` starts with `https://` and the app is rebuilt
   for that origin. Keep it at the proxy as well if your edge caches headers.
5. Confirm the proxy forwards `X-Forwarded-For`; login and intake rate limits
   key off it.
6. Keep the app on one instance for launch. The rate limiter is in-process and
   resets on restart, so horizontal scaling would weaken it.

## 7. Release sequence

1. CI passes on `main`: `npm ci`, typecheck, tests, production build.
2. Create the database and bucket; configure secrets.
3. Back up the database (or confirm this is the initial empty database).
   The pre-deploy command runs `npm run check:prod-env` before migrations.
4. Deploy. Watch the pre-deploy migration and build logs.
5. Wait for the health check at `/login` to pass.
6. Run the smoke checks below against the public HTTPS origin.
7. Enable 2FA on the owner account and record recovery procedures.

### Smoke checks after the first deploy

- `/login`, `/register`, an authenticated dashboard, and a signed-out redirect.
- Register the first owner; confirm the firm name and OWNER role.
- Create a contact and matter, then open the matter detail page.
- Upload a 25 MB `.docx` document, download it byte-for-byte, and confirm the
  object key is under `firms/<firmId>/matters/<matterId>/`.
  Local production smoke verified 25,000,000 bytes end to end with the key
  `firms/<firmId>/matters/<matterId>/<timestamp>-lex-25mb.docx`; repeat through
  the production proxy and S3 bucket.
- Generate a sample document and download it.
- Create an invoice, download its PDF, and verify the status label.
- Export deadlines as `.ics`.
- Enable public intake, submit the form, and confirm the submission appears in
  the inbox with the correct `APP_URL` link.
- Create an invitation and accept it in a second browser session.
- Confirm a consultant only sees an explicitly shared matter, and that a
  foreign firm/matter ID returns 404.
- Check server logs for migration errors, 500s, and storage credential errors.

## 8. Backups, monitoring, and rollback

- Database: paid PITR plus a scheduled logical dump stored outside the app
  account. Test a restore before launch, not during an incident.
- Objects: versioning, lifecycle/retention, and a copy or replication policy
  appropriate to the firm's retention obligations.
- Monitoring: uptime check on `/login`, error-rate/log alerts, disk/connection
  alerts, and an alert when the pre-deploy migration fails.
- Application rollback: redeploy the previous successful release.
- Database rollback: restore only when the migration cannot be corrected
  forward. Restore the matching object-storage snapshot as well.
- Keep the previous release's environment variables available; a rollback may
  need the prior schema shape.

## 9. Launch blockers and decisions

These are not code failures, but they need an explicit decision before the
site is public:

- **Registration policy:** the gate defaults to `bootstrap` and closes after
  the first firm. Decide whether ongoing public registration should be `open`
  or remain the safer `closed` default after the first owner is created.
- **Upload size:** the local production smoke passed at 25,000,000 bytes;
  confirm the same through the chosen proxy and S3 bucket, not just locally.
- **Rate limiting:** one instance only until Redis or a database-backed limiter
  is added.
- **Email:** there is no transactional email. Invitations and intake links are
  copied by hand, and password reset is not implemented.
- **Legal/compliance:** confirm retention, backup encryption, access-review,
  and incident-response requirements with the firm before storing client data.
- **HSTS/CSP:** HSTS is now emitted when `APP_URL` is HTTPS. A CSP has not been
  added and should be evaluated alongside the app's inline styles and scripts.
