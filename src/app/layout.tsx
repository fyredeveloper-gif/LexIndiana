import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Lex Indiana — Practice Management",
    template: "%s · Lex Indiana",
  },
  description:
    "Multi-tenant practice management and client intake for Indiana attorneys: matters, conflict checks, Trial Rule 6 deadlines, timekeeping, invoicing, and document assembly.",
};

export const viewport: Viewport = {
  themeColor: "#0d1c2b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
