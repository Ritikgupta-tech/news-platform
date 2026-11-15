/** Windowed page list: first, last, and two either side of the current page, with gaps marked. */
export function pageWindow(page: number, total: number): (number | "gap")[] {
  const set = new Set<number>([1, total, page - 2, page - 1, page, page + 1, page + 2].filter((n) => n >= 1 && n <= total));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((n, i) => { if (i > 0 && n - sorted[i - 1]! > 1) out.push("gap"); out.push(n); });
  return out;
}
