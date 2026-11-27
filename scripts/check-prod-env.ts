/**
 * Fail a production release before migrations run when required deployment
 * configuration is missing or unsafe. Never prints secret values.
 */
const errors: string[] = [];
const warnings: string[] = [];

function required(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) errors.push(`${name} is required`);
  return value;
}

if (process.env.NODE_ENV !== "production") {
  errors.push("NODE_ENV must be production");
}

const databaseUrl = required("DATABASE_URL");
if (databaseUrl && !databaseUrl.startsWith("file:")) {
  errors.push("DATABASE_URL must be a SQLite file URL (for example file:/var/data/lex.db)");
}

const authSecret = required("AUTH_SECRET");
if (authSecret && authSecret.length < 32) {
  errors.push("AUTH_SECRET must contain at least 32 characters");
}

const appUrl = required("APP_URL");
if (appUrl) {
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol !== "https:") errors.push("APP_URL must use https");
    if (appUrl.endsWith("/")) errors.push("APP_URL must not have a trailing slash");
  } catch {
    errors.push("APP_URL must be a valid absolute URL");
  }
}

if (process.env.SESSION_COOKIE_SECURE !== "true") {
  errors.push("SESSION_COOKIE_SECURE must be true");
}

const registrationMode = (process.env.REGISTRATION_MODE ?? "bootstrap").trim().toLowerCase();
if (!["open", "bootstrap", "closed"].includes(registrationMode)) {
  errors.push("REGISTRATION_MODE must be open, bootstrap, or closed");
} else if (registrationMode === "open") {
  warnings.push("REGISTRATION_MODE=open allows anyone to create a new firm");
}

const storageDriver = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();
if (!["s3", "local"].includes(storageDriver)) {
  errors.push("STORAGE_DRIVER must be s3 or local");
} else if (storageDriver === "local") {
  warnings.push("STORAGE_DRIVER=local writes documents to this host; mount a persistent disk");
}

const maxUpload = Number(process.env.MAX_UPLOAD_MB ?? 25);
if (!Number.isFinite(maxUpload) || maxUpload <= 0 || maxUpload > 100) {
  errors.push("MAX_UPLOAD_MB must be a number between 1 and 100");
}

if (storageDriver === "s3") {
  required("S3_BUCKET");
  required("S3_REGION");

  const accessKey = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  if (Boolean(accessKey) !== Boolean(secretKey)) {
    errors.push("Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither for an instance role");
  } else if (!accessKey && !secretKey) {
    warnings.push("No S3 key pair is set; the AWS credential chain will be used");
  }

  const s3Endpoint = process.env.S3_ENDPOINT?.trim();
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE?.trim();
  const sse = process.env.S3_SSE?.trim();
  if (!s3Endpoint && forcePathStyle !== "false") {
    errors.push("AWS S3 requires S3_FORCE_PATH_STYLE=false");
  }
  if (s3Endpoint && forcePathStyle !== "true") {
    warnings.push("S3_ENDPOINT is set; custom S3 endpoints usually need S3_FORCE_PATH_STYLE=true");
  }
  if (s3Endpoint && sse !== "none") {
    warnings.push("S3_ENDPOINT is set with server-side encryption enabled; use S3_SSE=none for R2 if it rejects AES256");
  }
  if (sse && !["AES256", "none"].includes(sse)) {
    errors.push("S3_SSE must be AES256, none, or unset");
  }
}

for (const warning of warnings) console.warn(`warning: ${warning}`);

if (errors.length > 0) {
  console.error("Production environment is not ready:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Production environment check passed.");
