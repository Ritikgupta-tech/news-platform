export const SEARCH_MIN = 2;
export const SEARCH_MAX = 100;
export const SEARCH_PAGE_SIZE = 10;
export const SEARCH_MAX_PAGE = 100;

export type SearchQuery = { ok: true; q: string; page: number } | { ok: false; reason: "empty" | "too_short" };

/**
 * Validates and normalises user search input.
 * - trims, collapses whitespace, strips control chars
 * - removes SQL LIKE wildcards (% _ \) so user input cannot widen a pattern match
 * - caps length (protects against expensive queries) and page depth
 */
export function parseSearchParams(raw: { q?: string | string[]; page?: string | string[] }): SearchQuery {
  const qRaw = Array.isArray(raw.q) ? raw.q[0] : raw.q;
  const pageRaw = Array.isArray(raw.page) ? raw.page[0] : raw.page;
  const q = (qRaw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[%_\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_MAX)
    .trim();
  if (!q) return { ok: false, reason: "empty" };
  if (q.length < SEARCH_MIN) return { ok: false, reason: "too_short" };
  const parsed = Number.parseInt(pageRaw ?? "1", 10);
  const page = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), SEARCH_MAX_PAGE) : 1;
  return { ok: true, q, page };
}

export function parsePage(raw: string | string[] | undefined, max = 10_000): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(v ?? "1", 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), max) : 1;
}

export function parseSort(raw: string | string[] | undefined): "relevance" | "latest" {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "latest" ? "latest" : "relevance";
}
