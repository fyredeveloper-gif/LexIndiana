import { environmentPaths } from "./paths.mjs";

/**
 * Environment for the embedded Next server. Desktop intentionally uses:
 * - a local SQLite file per environment (offline-first),
 * - local disk storage under the same repository folder,
 * - loopback HTTP, so the session cookie is not marked Secure,
 * - bootstrap registration in LIVE (first firm, then closed) and closed
 *   registration in DEMO, where the demo account is seeded.
 *
 * @param {{ userDataDir: string; environment: "demo" | "live"; port: number; authSecret: string }} options
 */
export function desktopServerEnv({ userDataDir, environment, port, authSecret }) {
  const paths = environmentPaths(userDataDir, environment);
  return {
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL: paths.databaseUrl,
    STORAGE_DRIVER: "local",
    STORAGE_ROOT: paths.storageRoot,
    MAX_UPLOAD_MB: "25",
    APP_URL: `http://127.0.0.1:${port}`,
    SESSION_COOKIE_SECURE: "false",
    AUTH_SECRET: authSecret,
    REGISTRATION_MODE: environment === "demo" ? "closed" : "bootstrap",
    TWO_FACTOR_ISSUER: "Lex Indiana",
    // Read by the desktop shell, ignored by the web app.
    LEX_DESKTOP: "1",
    LEX_ENVIRONMENT: environment,
  };
}

/** Demo credentials are synthetic-only and documented in docs/desktop/PLAN.md. */
export const DEMO_EMAIL = "quentin@lexindiana.test";
export const DEMO_FIRM_NAME = "Haynes & Associates LLC";
export function demoPassword() {
  return process.env.LEX_DEMO_PASSWORD || "IndianaLaw2026!";
}
