import Link from "next/link";
import { notFound } from "next/navigation";
import { MatterForm } from "@/components/forms/matter-forms";
import { Icon } from "@/components/icons";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getContacts, getMatters } from "@/lib/data";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/dates";
import { MATTER_STATUS_LABELS, cn } from "@/lib/utils";

export const metadata = { title: "Matters" };

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "INTAKE", label: "Intake" },
  { key: "PENDING", label: "Pending" },
  { key: "CLOSED", label: "Closed" },
];

export default async function MattersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "matter:read")) notFound();
  const canWrite = can(user.role, "matter:write");
  const { status, q } = await searchParams;
  const [matters, contacts] = await Promise.all([getMatters(user), getContacts(user)]);
  const clients = contacts.filter((contact) => contact.type === "CLIENT").map(({ id, name }) => ({ id, name }));

  const activeFilter = FILTERS.some((filter) => filter.key === status) ? status! : "ALL";
  const query = (q ?? "").trim().toLowerCase();

  const filtered = matters.filter((matter) => {
    if (activeFilter !== "ALL" && matter.status !== activeFilter) return false;
    if (!query) return true;
    return [matter.title, matter.clientName, matter.causeNumber ?? "", matter.county, matter.practiceArea, matter.courtName ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Case management"
        title="Matters"
        description="Every matter is tied to a primary client and your workspace. Indiana cause numbers, county, court, and status in one place."
      />

      {canWrite ? (
      <details className="card group overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:bg-ink-50/60">
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-900 text-brass-300">
              <Icon name="plus" className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink-900">Open a new matter</span>
              <span className="block text-xs text-ink-500">Run a conflict check first, then record the intake details.</span>
            </span>
          </span>
          <span className="text-xs font-medium text-brass-600 group-open:hidden">Expand</span>
          <span className="hidden text-xs font-medium text-brass-600 group-open:inline">Collapse</span>
        </summary>
        <div className="border-t border-ink-100 px-5 py-5">
          <MatterForm clients={clients} />
        </div>
      </details>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 rounded-lg border border-ink-200 bg-white p-1">
          {FILTERS.map((filter) => (
            <Link
              key={filter.key}
              href={`/matters${filter.key === "ALL" ? "" : `?status=${filter.key}`}${query ? `${filter.key === "ALL" ? "?" : "&"}q=${encodeURIComponent(query)}` : ""}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition",
                activeFilter === filter.key ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-50",
              )}
            >
              {filter.label}
            </Link>
          ))}
        </nav>

        <form action="/matters" className="flex items-center gap-2">
          {activeFilter !== "ALL" ? <input type="hidden" name="status" value={activeFilter} /> : null}
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-400" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search matters, clients, cause numbers"
              className="input w-[280px] pl-8"
              aria-label="Search matters"
            />
          </div>
          <button type="submit" className="btn btn-secondary btn-sm">
            Search
          </button>
        </form>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon="briefcase"
            title={matters.length === 0 ? "No matters yet" : "No matters match this filter"}
            description={
              matters.length === 0
                ? "Open a matter above. You will need at least one contact of type Client."
                : "Try a different status filter or search term."
            }
            action={
              <Link href="/contacts" className="btn btn-secondary btn-sm">
                Manage contacts
              </Link>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Matter</th>
                  <th className="th">Client</th>
                  <th className="th hidden md:table-cell">Court</th>
                  <th className="th hidden lg:table-cell">Opened</th>
                  <th className="th">Status</th>
                  <th className="th w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((matter) => (
                  <tr key={matter.id} className="group transition hover:bg-ink-50/60">
                    <td className="td">
                      <Link href={`/matters/${matter.id}`} className="font-medium text-ink-900 group-hover:text-ink-950">
                        {matter.title}
                      </Link>
                      <p className="mt-0.5 font-mono text-[11px] text-ink-400">
                        {matter.causeNumber ?? "No cause number"} · {matter.practiceArea}
                      </p>
                    </td>
                    <td className="td text-ink-600">{matter.clientName}</td>
                    <td className="td hidden md:table-cell text-ink-600">
                      <p>{matter.county} County</p>
                      <p className="text-[11px] text-ink-400">{matter.courtName ?? "Court not set"}</p>
                    </td>
                    <td className="td hidden lg:table-cell text-ink-500">{formatDate(matter.openedAt)}</td>
                    <td className="td">
                      <StatusBadge status={matter.status} label={MATTER_STATUS_LABELS[matter.status]} />
                    </td>
                    <td className="td">
                      <Link href={`/matters/${matter.id}`} aria-label={`Open ${matter.title}`}>
                        <Icon name="arrowRight" className="h-4 w-4 text-ink-300 group-hover:text-ink-700" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-[11px] text-ink-400">
        Showing {filtered.length} of {matters.length} matters. {clients.length} client
        {clients.length === 1 ? "" : "s"} available for intake.
      </p>
    </div>
  );
}
