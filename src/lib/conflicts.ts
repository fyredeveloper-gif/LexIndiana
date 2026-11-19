export type ConflictStatusValue = "CLEAR" | "REVIEW" | "SKIPPED";

export type ConflictContactInput = {
  id: string;
  name: string;
  aliases: string[];
  email: string | null;
  organization: string | null;
  notes: string | null;
};

export type ConflictContactMatch = {
  contactId: string;
  name: string;
  type: string;
  matchedFields: string[];
  matchedTerms: string[];
  matters: Array<{ id: string; title: string; status: string; role: string }>;
};

export type ConflictMatterMatch = {
  id: string;
  title: string;
  causeNumber: string | null;
  status: string;
  clientName: string;
};

export type ConflictScreen = {
  status: "CLEAR" | "REVIEW";
  terms: string[];
  matches: ConflictContactMatch[];
  matterMatches: ConflictMatterMatch[];
  scannedContacts: number;
  scannedMatters: number;
};

export type ConflictSnapshot = {
  status: "CLEAR" | "REVIEW";
  checkedAt: string;
  terms: string[];
  scannedContacts: number;
  scannedMatters: number;
  matches: ConflictContactMatch[];
  matterMatches: ConflictMatterMatch[];
};

/** Normalize a search term; returns null when it is too short to be useful. */
export function normalizeTerm(value: string | null | undefined): string | null {
  if (!value) return null;
  const term = value.trim().toLowerCase().replace(/\s+/g, " ");
  return term.length >= 2 ? term : null;
}

/** Split a free-text list of party names on commas, semicolons, or newlines. */
export function splitPartyNames(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
    .slice(0, 10);
}

/**
 * Matches one contact against a set of normalized terms. Contact ids listed in
 * `excludeContactIds` (e.g. a returning client submitting the intake form) are
 * never reported as conflicts against themselves.
 */
export function matchContact(
  contact: ConflictContactInput,
  terms: string[],
  excludeContactIds: string[] = [],
): { matchedFields: string[]; matchedTerms: string[] } | null {
  if (excludeContactIds.includes(contact.id)) return null;

  const fields = new Set<string>();
  const matchedTerms: string[] = [];
  const name = contact.name.toLowerCase();
  const aliases = contact.aliases.map((alias) => alias.toLowerCase());
  const email = contact.email?.toLowerCase() ?? "";
  const organization = contact.organization?.toLowerCase() ?? "";
  const notes = contact.notes?.toLowerCase() ?? "";

  for (const term of terms) {
    let hit = false;
    if (name.includes(term)) {
      fields.add("Name");
      hit = true;
    }
    if (aliases.some((alias) => alias.includes(term))) {
      fields.add("Alias");
      hit = true;
    }
    if (organization && organization.includes(term)) {
      fields.add("Organization");
      hit = true;
    }
    if (email && email.includes(term)) {
      fields.add("Email");
      hit = true;
    }
    if (notes.includes(term)) {
      fields.add("Notes");
      hit = true;
    }
    if (hit) matchedTerms.push(term);
  }

  if (fields.size === 0) return null;
  return { matchedFields: Array.from(fields), matchedTerms };
}

/** Build the JSON snapshot stored with an intake submission. */
export function toConflictSnapshot(screen: ConflictScreen): ConflictSnapshot {
  return {
    status: screen.status,
    checkedAt: new Date().toISOString(),
    terms: screen.terms,
    scannedContacts: screen.scannedContacts,
    scannedMatters: screen.scannedMatters,
    matches: screen.matches.slice(0, 25).map((match) => ({
      ...match,
      matters: match.matters.slice(0, 5),
    })),
    matterMatches: screen.matterMatches.slice(0, 10),
  };
}
