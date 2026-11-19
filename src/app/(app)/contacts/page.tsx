import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { ContactForm } from "@/components/forms/contact-forms";
import { Icon } from "@/components/icons";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getContacts } from "@/lib/data";
import { can } from "@/lib/permissions";
import { CONTACT_TYPE_LABELS, cn, titleCase } from "@/lib/utils";

export const metadata = { title: "Contacts" };

const TYPES = [
  { key: "ALL", label: "All contacts" },
  { key: "CLIENT", label: "Clients" },
  { key: "OPPOSING_PARTY", label: "Opposing parties" },
  { key: "OPPOSING_COUNSEL", label: "Opposing counsel" },
  { key: "WITNESS", label: "Witnesses" },
];

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "contact:read")) notFound();
  const canWrite = can(user.role, "contact:write");
  const { type, q } = await searchParams;
  const contacts = await getContacts(user);

  const activeType = TYPES.some((entry) => entry.key === type) ? type! : "ALL";
  const query = (q ?? "").trim().toLowerCase();

  const filtered = contacts.filter((contact) => {
    if (activeType !== "ALL" && contact.type !== activeType) return false;
    if (!query) return true;
    return [contact.name, contact.aliases.join(" "), contact.organization ?? "", contact.email ?? "", contact.notes ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Intake & conflicts"
        title="Contacts"
        description="Clients, opposing parties, opposing counsel, and witnesses. Names, aliases, and notes feed the workspace conflict checker."
        actions={
          <Link href="/conflicts" className="btn btn-secondary">
            <Icon name="shield" className="h-4 w-4" />
            Run conflict check
          </Link>
        }
      />

      {canWrite ? (
      <details className="card group overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:bg-ink-50/60">
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-900 text-brass-300">
              <Icon name="plus" className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink-900">Add a contact</span>
              <span className="block text-xs text-ink-500">Record alternate names and aliases while the details are fresh.</span>
            </span>
          </span>
          <span className="text-xs font-medium text-brass-600 group-open:hidden">Expand</span>
          <span className="hidden text-xs font-medium text-brass-600 group-open:inline">Collapse</span>
        </summary>
        <div className="border-t border-ink-100 px-5 py-5">
          <ContactForm />
        </div>
      </details>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 rounded-lg border border-ink-200 bg-white p-1">
          {TYPES.map((entry) => (
            <Link
              key={entry.key}
              href={`/contacts${entry.key === "ALL" ? "" : `?type=${entry.key}`}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition",
                activeType === entry.key ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-50",
              )}
            >
              {entry.label}
            </Link>
          ))}
        </nav>

        <form action="/contacts" className="flex items-center gap-2">
          {activeType !== "ALL" ? <input type="hidden" name="type" value={activeType} /> : null}
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-400" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search names, aliases, notes"
              className="input w-[260px] pl-8"
              aria-label="Search contacts"
            />
          </div>
          <button type="submit" className="btn btn-secondary btn-sm">
            Search
          </button>
        </form>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon="users"
            title={contacts.length === 0 ? "No contacts yet" : "No contacts match this filter"}
            description={
              contacts.length === 0
                ? "Add a client to open your first matter, or record an opposing party for conflict checking."
                : "Try a different type filter or search term."
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((contact) => (
            <Card key={contact.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-3 px-5 pt-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">{contact.name}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {contact.organization ?? "Individual"}
                    {contact.matterCount > 0
                      ? ` · ${contact.matterCount} matter${contact.matterCount === 1 ? "" : "s"}`
                      : " · no matters"}
                  </p>
                </div>
                <Badge className="shrink-0 bg-ink-100 text-ink-600">
                  {CONTACT_TYPE_LABELS[contact.type] ?? titleCase(contact.type)}
                </Badge>
              </div>

              <div className="mt-3 space-y-1.5 px-5 text-xs text-ink-600">
                {contact.email ? (
                  <p className="flex items-center gap-2">
                    <Icon name="mail" className="h-3.5 w-3.5 text-ink-400" />
                    {contact.email}
                  </p>
                ) : null}
                {contact.phone ? (
                  <p className="flex items-center gap-2">
                    <Icon name="phone" className="h-3.5 w-3.5 text-ink-400" />
                    {contact.phone}
                  </p>
                ) : null}
                {contact.aliases.length > 0 ? (
                  <p className="flex flex-wrap gap-1 pt-1">
                    {contact.aliases.map((alias) => (
                      <Badge key={alias} className="bg-brass-50 text-brass-700">
                        {alias}
                      </Badge>
                    ))}
                  </p>
                ) : null}
                {contact.notes ? (
                  <p className="mt-2 line-clamp-3 rounded-md bg-ink-50 px-3 py-2 text-[11px] leading-relaxed text-ink-600">
                    {contact.notes}
                  </p>
                ) : null}
              </div>

              {canWrite ? (
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-ink-100 px-5 py-3">
                <details className="group">
                  <summary className="cursor-pointer list-none text-[11px] font-semibold text-ink-600 hover:text-ink-900">
                    Edit contact
                  </summary>
                  <div className="fixed inset-x-4 top-20 z-40 mx-auto max-h-[80vh] max-w-xl overflow-y-auto rounded-xl border border-ink-200 bg-white p-5 shadow-2xl sm:inset-x-auto sm:right-10">
                    <ContactForm
                      contact={{
                        id: contact.id,
                        type: contact.type,
                        name: contact.name,
                        aliases: contact.aliases,
                        email: contact.email,
                        phone: contact.phone,
                        organization: contact.organization,
                        address: contact.address,
                        notes: contact.notes,
                      }}
                    />
                  </div>
                </details>
                <ActionButton
                  url={`/api/contacts/${contact.id}`}
                  method="DELETE"
                  label="Delete"
                  busyLabel="…"
                  confirmText={`Delete ${contact.name}? This cannot be undone.`}
                  className="text-[11px] font-medium text-ink-400 hover:text-red-600"
                />
              </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <p className="text-[11px] text-ink-400">
        Showing {filtered.length} of {contacts.length} contacts. Deletion is blocked for contacts that are the primary
        client on a matter.
      </p>
    </div>
  );
}
