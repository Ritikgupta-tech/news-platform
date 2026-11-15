import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import type { CategoryShortcut } from "@/config/navigation";

export function CategoryShortcuts({ items }: { items: CategoryShortcut[] }) {
  return (
    <ul className="cat-grid" aria-label="Browse categories">
      {items.map((c) => (
        <li key={c.slug}>
          <Link href={`/category/${c.slug}`} className="cat-card">
            <span className="cat-card__icon"><Icon name={c.icon} size={22} /></span>
            <span className="cat-card__name">{c.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
