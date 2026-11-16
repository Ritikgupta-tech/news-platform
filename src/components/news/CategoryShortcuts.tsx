import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import type { CategoryShortcut } from "@/config/navigation";

export function CategoryShortcuts({ items }: { items: CategoryShortcut[] }) {
  return (
    <div className="cat-shortcuts-wrap">
      <div className="cat-shortcuts-head">
        <span className="cat-shortcuts-label">CURATED SECTIONS</span>
        <span className="cat-shortcuts-rule" aria-hidden="true" />
      </div>
      <ul className="cat-grid" aria-label="Browse editorial categories">
        {items.map((c) => (
          <li key={c.slug}>
            <Link href={`/category/${c.slug}`} className="cat-card">
              <span className="cat-card__icon">
                <Icon name={c.icon} size={20} />
              </span>
              <span className="cat-card__body">
                <span className="cat-card__name">{c.name}</span>
                <span className="cat-card__desc">Explore section →</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
