"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { TimerWidget, type ActiveTimer } from "@/components/timer-widget";
import { STAFF_ROLE_LABELS, can, canAny, type Capability } from "@/lib/permissions";
import type { StaffRole } from "@prisma/client";
import { cn, initials } from "@/lib/utils";
import { apiRequest } from "@/lib/client";

const NAV: Array<{ href: string; label: string; icon: string; capabilities?: Capability[] }> = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/matters", label: "Matters", icon: "briefcase", capabilities: ["matter:read"] },
  { href: "/contacts", label: "Contacts", icon: "users", capabilities: ["contact:read"] },
  { href: "/conflicts", label: "Conflict Check", icon: "shield", capabilities: ["conflict:read"] },
  { href: "/intake", label: "Intake", icon: "mail", capabilities: ["intake:view"] },
  { href: "/tasks", label: "Tasks", icon: "check", capabilities: ["task:read"] },
  { href: "/calendar", label: "Calendar", icon: "calendar", capabilities: ["calendar:read"] },
  { href: "/deadlines", label: "Deadlines", icon: "clock", capabilities: ["deadline:read"] },
  { href: "/time", label: "Time", icon: "clock", capabilities: ["time:own", "time:view_all"] },
  { href: "/invoices", label: "Invoices", icon: "invoice", capabilities: ["invoice:read"] },
  { href: "/templates", label: "Templates", icon: "template", capabilities: ["template:read"] },
  { href: "/firm", label: "Firm", icon: "users", capabilities: ["members:view", "firm:profile"] },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function Sidebar({
  user,
  role,
  activeTimer,
  intakeCount = 0,
}: {
  user: { name: string; email: string; firmName: string | null };
  role: StaffRole;
  activeTimer: ActiveTimer | null;
  intakeCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const nav = NAV.filter((item) => !item.capabilities || canAny(role, item.capabilities));
  const showTimer = can(role, "time:own");

  const signOut = async () => {
    setSigningOut(true);
    await apiRequest("/api/auth/logout", { method: "POST", body: {} });
    router.push("/login");
    router.refresh();
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[262px] shrink-0 flex-col bg-ink-950 px-4 py-6 text-ink-100 lg:flex">
        <Link href="/dashboard" className="mb-7 flex items-center gap-3 px-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brass-500 text-ink-950">
            <Icon name="scale" className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-serif text-[17px] font-semibold leading-tight text-white">Lex Indiana</span>
            <span className="block text-[10px] uppercase tracking-[0.18em] text-ink-400">Practice management</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-0.5">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition",
                isActive(item.href)
                  ? "bg-white/10 text-white"
                  : "text-ink-300 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon
                name={item.icon}
                className={cn("h-[18px] w-[18px]", isActive(item.href) ? "text-brass-300" : "text-ink-400 group-hover:text-ink-200")}
              />
              {item.label}
              <span className="ml-auto flex items-center gap-1.5">
                {item.href === "/intake" && intakeCount > 0 ? (
                  <span className="rounded-full bg-brass-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-ink-950">
                    {intakeCount}
                  </span>
                ) : null}
                {isActive(item.href) ? <span className="h-1.5 w-1.5 rounded-full bg-brass-400" /> : null}
              </span>
            </Link>
          ))}
        </nav>

        <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
          {showTimer ? <TimerWidget active={activeTimer} /> : null}
          <div className="flex items-center gap-2.5 px-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-800 text-[11px] font-semibold text-brass-200">
              {initials(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{user.name}</p>
              <p className="truncate text-[10px] text-ink-400">{STAFF_ROLE_LABELS[role]}</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              title="Sign out"
              className="rounded-md p-1.5 text-ink-400 transition hover:bg-white/10 hover:text-white"
            >
              <Icon name="logout" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950 lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brass-500 text-ink-950">
              <Icon name="scale" className="h-4 w-4" />
            </span>
            <span className="font-serif text-[15px] font-semibold text-white">Lex Indiana</span>
          </Link>
          <div className="flex items-center gap-2">
            {activeTimer ? (
              <Link href="/time" className="flex items-center gap-1.5 rounded-md bg-brass-500/20 px-2 py-1 text-[10px] font-semibold text-brass-200">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass-300" />
                Timer
              </Link>
            ) : null}
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="rounded-md p-1.5 text-ink-300 hover:text-white"
              title="Sign out"
            >
              <Icon name="logout" className="h-4 w-4" />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium",
                isActive(item.href) ? "bg-white/10 text-white" : "text-ink-300",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
