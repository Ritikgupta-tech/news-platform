import type { Metadata } from "next";
import { TagManager } from "@/components/admin/TagManager";
import { Pagination } from "@/components/news/Pagination";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getDeps } from "@/server/container";
import { listTags, listTagsQuery } from "@/server/tags/service";

export const metadata: Metadata = { title: "Tags", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminTags({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const access = await requirePageAccess("/admin/tags", "tag:manage");
  if ("denied" in access) return access.denied;
  const parsed = listTagsQuery.safeParse({ page: (await searchParams).page, pageSize: 25 });
  const q = parsed.success ? parsed.data : listTagsQuery.parse({ pageSize: 25 });
  const { items, meta } = await listTags(getDeps(), q);
  return (
    <div className="stack">
      <div className="page-head"><h1>Tags</h1></div>
      <TagManager tags={items} />
      <Pagination basePath="/admin/tags" page={meta.page} totalPages={meta.totalPages} />
    </div>
  );
}
