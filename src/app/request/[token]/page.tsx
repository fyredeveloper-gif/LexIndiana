import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { PublicIntakeForm } from "@/components/intake/public-intake-form";
import { prisma } from "@/lib/prisma";
import { isPlausibleIntakeToken } from "@/lib/intake";

export const dynamic = "force-dynamic";

async function findFirm(token: string) {
  if (!isPlausibleIntakeToken(token)) return null;
  return prisma.firm.findFirst({
    where: { intakeToken: token, intakeEnabled: true },
    select: {
      name: true,
      address: true,
      phone: true,
      email: true,
      intakeHeadline: true,
      intakeIntro: true,
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const firm = await findFirm(token);
  return {
    title: firm ? `Client intake · ${firm.name}` : "Client intake",
    robots: { index: false, follow: false },
  };
}

const NEXT_STEPS = [
  {
    title: "We review your request",
    copy: "A member of the firm reads the details you provide and checks whether we can help.",
  },
  {
    title: "Conflict screening",
    copy: "We screen the names involved against our existing clients and matters before any engagement.",
  },
  {
    title: "We contact you",
    copy: "If there is no conflict and the matter is a fit, we will reach out using the details you provided.",
  },
];

export default async function PublicIntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const firm = await findFirm(token);
  if (!firm) notFound();

  const firmName = firm.name;
  const headline = firm.intakeHeadline?.trim() || "Request a consultation";
  const intro =
    firm.intakeIntro?.trim() ||
    "Tell us briefly about your situation. We will review your information, screen for conflicts, and contact you about next steps.";

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-ink-950 text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brass-500 text-ink-950">
              <Icon name="scale" className="h-5 w-5" />
            </span>
            <div>
              <p className="font-serif text-lg font-semibold leading-tight">{firmName}</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-ink-400">Client intake</p>
            </div>
          </div>
          <div className="text-xs leading-relaxed text-ink-300">
            {firm.phone ? <p>{firm.phone}</p> : null}
            {firm.email ? <p>{firm.email}</p> : null}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[1.65fr_1fr]">
        <section>
          <h1 className="font-serif text-[30px] font-semibold leading-tight text-ink-900 sm:text-[34px]">
            {headline}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">{intro}</p>

          <div className="card mt-6 px-5 py-6 sm:px-6">
            <PublicIntakeForm token={token} firmName={firmName} />
          </div>
        </section>

        <aside className="space-y-4">
          <div className="card px-5 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">What happens next</p>
            <ol className="mt-3 space-y-4">
              {NEXT_STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[11px] font-semibold text-brass-300">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-ink-800">{step.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">{step.copy}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border border-ink-200 bg-ink-50 px-5 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">Please note</p>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-600">
              Submitting this form does not create an attorney-client relationship. Please do not include confidential
              documents or sensitive identifiers. We use your information only to review your request and screen for
              conflicts.
            </p>
          </div>

          {firm.address ? (
            <div className="px-1 text-[11px] leading-relaxed text-ink-400">
              <p className="font-semibold uppercase tracking-[0.12em] text-ink-500">Office</p>
              <p className="mt-1">{firm.address}</p>
            </div>
          ) : null}
        </aside>
      </main>

      <footer className="border-t border-ink-200 px-5 py-6 text-center text-[10px] text-ink-400 sm:px-8">
        © {new Date().getFullYear()} {firmName}. Deadline and conflict tools are informational; nothing here is legal
        advice.
      </footer>
    </div>
  );
}
