import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { pageWindow } from "@/lib/page-window";

interface Props { basePath: string; page: number; totalPages: number; params?: Record<string, string> }

function href(basePath: string, page: number, params: Record<string, string> = {}) {
  const sp = new URLSearchParams(params);
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({ basePath, page, totalPages, params }: Props) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      {page > 1 ? <Link className="pagination__step" rel="prev" href={href(basePath, page - 1, params)}><Icon name="chevronLeft" size={16} />Previous</Link> : <span />}
      <ul>
        {pageWindow(page, totalPages).map((n, i) => n === "gap" ? <li key={`g${i}`} aria-hidden="true">…</li> : (
          <li key={n}><Link href={href(basePath, n, params)} className={n === page ? "is-current" : ""} aria-current={n === page ? "page" : undefined} aria-label={`Page ${n}`}>{n}</Link></li>
        ))}
      </ul>
      {page < totalPages ? <Link className="pagination__step" rel="next" href={href(basePath, page + 1, params)}>Next<Icon name="chevronRight" size={16} /></Link> : <span />}
    </nav>
  );
}
