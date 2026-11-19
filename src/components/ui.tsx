import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { cn, statusBadgeClasses } from "@/lib/utils";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("card", className)}>{children}</section>;
}

export function CardHeader({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-ink-50 text-ink-600">
            <Icon name={icon} className="h-4 w-4" />
          </span>
        ) : null}
        <div>
          <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-ink-500">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brass-600">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold text-ink-900 sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("badge", className ?? "bg-ink-100 text-ink-600")}>{children}</span>;
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={cn("badge", statusBadgeClasses(status))}>{label ?? status}</span>;
}

export function Stat({
  label,
  value,
  detail,
  icon,
  accent,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: string;
  accent?: "brass" | "danger" | "default";
}) {
  return (
    <div className="card px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">{label}</p>
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            accent === "brass"
              ? "bg-brass-50 text-brass-600"
              : accent === "danger"
                ? "bg-red-50 text-red-600"
                : "bg-ink-50 text-ink-600",
          )}
        >
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2.5 font-serif text-[26px] font-semibold leading-none text-ink-900">{value}</p>
      {detail ? <p className="mt-1.5 text-xs text-ink-500">{detail}</p> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon = "briefcase",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-ink-50 text-ink-400">
        <Icon name={icon} />
      </span>
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-ink-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-red-600">{error}</p> : null}
      {!error && hint ? <p className="mt-1 text-[11px] text-ink-400">{hint}</p> : null}
    </div>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: "border-ink-200 bg-ink-50 text-ink-700",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  } as const;
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-xs leading-relaxed", tones[tone])}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}

export function SectionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-ink-100 py-3 last:border-0 sm:grid-cols-[160px_1fr]">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-ink-800">{children}</dd>
    </div>
  );
}
