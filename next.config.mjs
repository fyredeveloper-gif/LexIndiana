/**
 * Plain ESM on purpose: the packaged desktop app runs `next` at runtime without
 * the TypeScript toolchain, so a .ts config would be a packaging dependency.
 * @type {import("next").NextConfig}
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  reactStrictMode: true,
  // Allows the E2E test runner to build in an isolated directory without
  // touching the development/production `.next` output.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Development-only extra hosts for dev assets and HMR (comma-separated).
  // Kept out of source so a checkout is not tied to one preview environment.
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  serverExternalPackages: ["@prisma/client", "prisma", "pizzip", "docxtemplater"],
  async headers() {
    const hsts = (process.env.APP_URL ?? "").startsWith("https://")
      ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
      : [];
    return [
      {
        source: "/:path*",
        headers: [...securityHeaders, ...hsts],
      },
    ];
  },
};

export default nextConfig;
