import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Allows the E2E test runner to build in an isolated directory without
  // touching the development/production `.next` output.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Development-only: allow the cloud preview host to load dev assets and HMR.
  allowedDevOrigins: ["pv-a0d87b30f0f4-7435e6cc-91b2-45ad-abbd-d4581f437910.style.dev"],
  serverExternalPackages: ["@prisma/client", "prisma", "pizzip", "docxtemplater"],
  async headers() {
    const hsts =
      (process.env.APP_URL ?? "").startsWith("https://")
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
