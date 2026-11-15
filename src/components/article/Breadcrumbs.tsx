import Link from "next/link";

export function Breadcrumbs({ items }: { items: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        {items.map((it, i) => (
          <li key={it.name}>
            {it.href && i < items.length - 1 ? <Link href={it.href}>{it.name}</Link> : <span aria-current={i === items.length - 1 ? "page" : undefined}>{it.name}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
