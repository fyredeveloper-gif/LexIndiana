"use client";

import { useState, type FormEvent } from "react";
import { Badge, Callout, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { apiRequest } from "@/lib/client";
import { CONTACT_TYPE_LABELS, titleCase } from "@/lib/utils";

type ConflictResponse = {
  query: string;
  contactsScanned: number;
  mattersScanned: number;
  contacts: Array<{
    contact: {
      id: string;
      name: string;
      type: string;
      aliases: string[];
      email: string | null;
      organization: string | null;
      notes: string | null;
    };
    matchedFields: string[];
    matters: Array<{ id: string; title: string; status: string; role: string }>;
  }>;
  matters: Array<{ id: string; title: string; causeNumber: string | null; status: string; clientName: string }>;
};

export function ConflictChecker() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ConflictResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) {
      setError("Enter at least two characters to search.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await apiRequest<ConflictResponse>(`/api/conflicts?q=${encodeURIComponent(query.trim())}`);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setResults(result.data);
  };

  const hasMatches = Boolean(results && (results.contacts.length > 0 || results.matters.length > 0));

  return (
    <div className="space-y-5">
      <form onSubmit={search} className="card p-5">
        <label className="label" htmlFor="conflict-query">
          Search every name, alias, note, and matter in your workspace
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Icon name="search" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
            <input
              id="conflict-query"
              className="input pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. Whitmore, 49D01-2601-CT-001234, Hoosier Logistics"
              autoComplete="off"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Searching…" : "Run conflict check"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-ink-400">
          Runs inside your tenant only. Search is case-insensitive and matches partial names.
        </p>
        {error ? <div className="mt-3"><Callout tone="danger">{error}</Callout></div> : null}
      </form>

      {results ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 bg-white px-4 py-3 text-xs text-ink-600">
            <span className="flex items-center gap-1.5 font-semibold text-ink-800">
              <Icon name="shield" className="h-4 w-4 text-brass-600" />
              Results for &ldquo;{results.query}&rdquo;
            </span>
            <span className="text-ink-400">
              {results.contactsScanned} contacts and {results.mattersScanned} matters scanned
            </span>
            <span className="ml-auto">
              {hasMatches ? (
                <Badge className="bg-amber-50 text-amber-800">{results.contacts.length + results.matters.length} matches</Badge>
              ) : (
                <Badge className="bg-emerald-50 text-emerald-700">No conflicts found</Badge>
              )}
            </span>
          </div>

          {!hasMatches ? (
            <div className="card">
              <EmptyState
                icon="shield"
                title="No matching names, aliases, or notes"
                description="No existing contact or matter in your workspace matches this search. Record the check in the matter notes before opening it."
              />
            </div>
          ) : null}

          {results.contacts.length > 0 ? (
            <div className="card overflow-hidden">
              <div className="border-b border-ink-100 px-5 py-3">
                <h3 className="text-sm font-semibold text-ink-900">Contact matches</h3>
              </div>
              <ul className="divide-y divide-ink-100">
                {results.contacts.map((match) => (
                  <li key={match.contact.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink-900">{match.contact.name}</p>
                      <Badge className="bg-ink-100 text-ink-600">
                        {CONTACT_TYPE_LABELS[match.contact.type] ?? titleCase(match.contact.type)}
                      </Badge>
                      {match.matchedFields.map((field) => (
                        <Badge key={field} className="bg-amber-50 text-amber-800">
                          {field}
                        </Badge>
                      ))}
                    </div>
                    {match.contact.aliases.length > 0 ? (
                      <p className="mt-1 text-xs text-ink-500">Aliases: {match.contact.aliases.join(", ")}</p>
                    ) : null}
                    {match.contact.organization ? (
                      <p className="mt-0.5 text-xs text-ink-500">{match.contact.organization}</p>
                    ) : null}
                    {match.contact.notes ? (
                      <p className="mt-1.5 rounded-md bg-ink-50 px-3 py-2 text-xs leading-relaxed text-ink-600">
                        {match.contact.notes}
                      </p>
                    ) : null}
                    {match.matters.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {match.matters.map((matter) => (
                          <Badge key={matter.id} className="bg-ink-50 text-ink-600">
                            {matter.title} · {matter.role}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px] text-ink-400">Not currently linked to a matter.</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {results.matters.length > 0 ? (
            <div className="card overflow-hidden">
              <div className="border-b border-ink-100 px-5 py-3">
                <h3 className="text-sm font-semibold text-ink-900">Matter text matches</h3>
              </div>
              <ul className="divide-y divide-ink-100">
                {results.matters.map((matter) => (
                  <li key={matter.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink-800">{matter.title}</p>
                      <p className="text-xs text-ink-500">
                        {matter.clientName}
                        {matter.causeNumber ? ` · ${matter.causeNumber}` : ""}
                      </p>
                    </div>
                    <Badge className="bg-ink-100 text-ink-600">{titleCase(matter.status)}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
