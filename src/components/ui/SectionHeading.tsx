import Link from "next/link";
import { Icon } from "./Icon";

export function SectionHeading({ title, href, linkLabel = "View all" }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {href ? (
        <Link href={href} className="section-heading__link">
          {linkLabel} <Icon name="arrowRight" size={16} />
        </Link>
      ) : null}
    </div>
  );
}
