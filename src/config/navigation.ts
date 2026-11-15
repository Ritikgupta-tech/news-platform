import type { IconName } from "@/components/ui/Icon";

export interface NavItem { label: string; href: string }

export const PRIMARY_NAV: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "World", href: "/category/world" },
  { label: "Business", href: "/category/business" },
  { label: "Technology", href: "/category/technology" },
  { label: "Health", href: "/category/health" },
  { label: "Sports", href: "/category/sports" },
  { label: "Entertainment", href: "/category/entertainment" },
];

export interface CategoryShortcut { slug: string; name: string; icon: IconName }
export const CATEGORY_SHORTCUTS: CategoryShortcut[] = [
  { slug: "world", name: "World", icon: "globe" },
  { slug: "business", name: "Business", icon: "briefcase" },
  { slug: "technology", name: "Technology", icon: "cpu" },
  { slug: "health", name: "Health", icon: "heart" },
  { slug: "sports", name: "Sports", icon: "trophy" },
  { slug: "entertainment", name: "Entertainment", icon: "film" },
];

export const FOOTER_LINKS = {
  quick: [
    { label: "Latest news", href: "/news" },
    { label: "Trending", href: "/trending" },
    { label: "Most read", href: "/most-read" },
    { label: "Newsletter", href: "/newsletter" },
    { label: "RSS feed", href: "/feed.xml" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  legal: [
    { label: "Privacy policy", href: "/privacy-policy" },
    { label: "Terms and conditions", href: "/terms" },
  ],
};
