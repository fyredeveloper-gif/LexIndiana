import { Sidebar } from "@/components/sidebar";
import { requireUser } from "@/lib/auth";
import { getActiveTimer, getNewIntakeCount } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [activeTimer, intakeCount] = await Promise.all([getActiveTimer(user), getNewIntakeCount(user)]);

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar
        user={{ name: user.name, email: user.email, firmName: user.firmName }}
        role={user.role}
        activeTimer={activeTimer}
        intakeCount={intakeCount}
      />
      <div className="min-w-0 flex-1">
        <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:px-10 lg:py-9">{children}</main>
        <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-[11px] text-ink-400 sm:px-6 lg:px-10">
          Lex Indiana · Deadline calculations follow Ind. R. Trial P. 6 and Ind. Code § 1-1-9-1 but are not legal
          advice. Verify every date before filing.
        </footer>
      </div>
    </div>
  );
}
