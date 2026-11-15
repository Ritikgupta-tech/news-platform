/** URL-safe slug. Callers must still enforce uniqueness (append a suffix on conflict). */
export function slugify(input: string, maxLength = 80): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || "untitled";
}

export function withSuffix(slug: string, n: number): string {
  return n <= 1 ? slug : `${slug}-${n}`;
}
