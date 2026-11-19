import Link from "next/link";
import { Icon } from "@/components/icons";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink-950 px-12 py-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="relative">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brass-500 text-ink-950">
              <Icon name="scale" className="h-6 w-6" />
            </span>
            <span>
              <span className="block font-serif text-xl font-semibold text-white">Lex Indiana</span>
              <span className="block text-[10px] uppercase tracking-[0.2em] text-ink-400">Practice management</span>
            </span>
          </Link>

          <h1 className="mt-16 max-w-md font-serif text-[34px] font-semibold leading-[1.15] text-white">
            A private workspace for every Indiana matter.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-300">
            Intake, conflict checks, cause numbers, Trial Rule 6 deadlines, timekeeping, invoices, and document
            assembly — in one isolated tenant workspace.
          </p>

          <ul className="mt-10 space-y-4">
            {[
              ["shield", "Tenant isolation", "Every record is scoped to your firm — no cross-firm reads."],
              ["calendar", "Rule 6 deadline engine", "Mail service adds three days; weekends and Indiana holidays roll forward."],
              ["template", "Document assembly", "Merge {{placeholders}} into .docx files stored in the matter folder."],
            ].map(([icon, title, copy]) => (
              <li key={title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-brass-300">
                  <Icon name={icon} className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-400">{copy}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative max-w-sm text-[11px] leading-relaxed text-ink-500">
          Built for Indiana practitioners. Deadline tools follow Ind. R. Trial P. 6 (eff. July 1, 2026) and Ind. Code
          § 1-1-9-1; local rules and court closures must still be confirmed.
        </p>
      </aside>

      <main className="flex min-h-screen flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-900 text-brass-300">
              <Icon name="scale" className="h-5 w-5" />
            </span>
            <span className="font-serif text-lg font-semibold text-ink-900">Lex Indiana</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
