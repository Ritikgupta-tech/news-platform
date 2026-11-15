import type { Metadata } from "next";
import { ArticleEditor } from "@/components/editorial/ArticleEditor";
import { listCategories } from "@/server/categories/service";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getDeps } from "@/server/container";

export const metadata: Metadata = { title: "New article", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NewArticle() {
  const access = await requirePageAccess("/author/articles/new", "article:create");
  if ("denied" in access) return access.denied;
  const categories = await listCategories(getDeps(), access.ctx, false);
  return (
    <div className="stack">
      <h1>New article</h1>
      <ArticleEditor categories={categories.map((c) => ({ id: c.id, name: c.name }))} canEdit canSubmit />
    </div>
  );
}
