/**
 * Contact aliases were a PostgreSQL `String[]`. SQLite has no primitive list
 * type, so they are stored as a JSON array in a TEXT column. These helpers are
 * the only place that knows the storage encoding; the rest of the app keeps
 * working with `string[]`.
 */
const MAX_ALIASES = 25;

export function parseAliases(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((alias): alias is string => typeof alias === "string");
  } catch {
    // Tolerate legacy/hand-edited values by treating the whole string as one alias.
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
}

export function serializeAliases(value: string[] | string | null | undefined): string {
  const list = Array.isArray(value) ? value : value ? value.split(",") : [];
  const cleaned = list
    .map((alias) => alias.trim())
    .filter(Boolean)
    .slice(0, MAX_ALIASES);
  return JSON.stringify(cleaned);
}
