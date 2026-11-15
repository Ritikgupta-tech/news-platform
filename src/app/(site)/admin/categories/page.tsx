import type { Metadata } from "next";
import { CategoryManager } from "@/components/admin/CategoryManager";
import { requirePageAccess } from "@/server/auth/page-guard";
import { listCategories } from "@/server/categories/service";
import { getDeps } from "@/server/container";

export const metadata: Metadata = { title: "Categories", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminCategories() {
  const access = await requirePageAccess("/admin/categories", "category:manage");
  if ("denied" in access) return access.denied;
  const categories = await listCategories(getDeps(), access.ctx, true);
  return (
    <div className="stack">
      <div className="page-head"><h1>Categories</h1><p className="muted">Hidden categories disappear from the public site but keep their articles. A category with articles cannot be deleted; hide it instead.</p></div>
      <CategoryManager categories={categories} />
    </div>
  );
}
