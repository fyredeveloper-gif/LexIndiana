import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { getSessionUser } from "@/lib/auth";
import { getRegistrationAccess } from "@/lib/registration";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  const { next } = await searchParams;
  const registration = await getRegistrationAccess();

  return (
    <div className="space-y-6">
      <LoginForm nextPath={next} registration={registration} />

      {process.env.NODE_ENV !== "production" ? (
        <div className="rounded-lg border border-ink-200 bg-white/60 px-4 py-3 text-[11px] leading-relaxed text-ink-500">
          <p className="font-semibold text-ink-700">Demo workspace</p>
          <p className="mt-0.5">
            {process.env.DEMO_EMAIL ?? "demo@lexindiana.test"} · {process.env.DEMO_PASSWORD ?? "IndianaLaw2026!"}
          </p>
          <p className="mt-1">Run <code className="font-mono">npm run db:seed</code> to load sample matters and deadlines.</p>
        </div>
      ) : null}
    </div>
  );
}
