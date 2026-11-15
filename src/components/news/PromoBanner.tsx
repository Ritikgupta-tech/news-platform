import { ButtonLink } from "@/components/ui/Button";

export interface PromoConfig { eyebrow?: string; title: string; body?: string; ctaLabel: string; ctaHref: string }

/** Content comes from the CMS-managed homepage configuration (built in the admin stage). */
export function PromoBanner({ promo }: { promo: PromoConfig }) {
  return (
    <aside className="promo" aria-label="Promotion">
      <div>
        {promo.eyebrow ? <p className="promo__eyebrow">{promo.eyebrow}</p> : null}
        <h2>{promo.title}</h2>
        {promo.body ? <p>{promo.body}</p> : null}
      </div>
      <ButtonLink href={promo.ctaHref} variant="secondary">{promo.ctaLabel}</ButtonLink>
      <span className="promo__art" aria-hidden="true" />
    </aside>
  );
}
