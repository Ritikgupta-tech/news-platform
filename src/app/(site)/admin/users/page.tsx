import type { Metadata } from "next";
import Link from "next/link";
import { RoleEditor } from "@/components/admin/RoleEditor";
import { Pagination } from "@/components/news/Pagination";
import { StateMessage } from "@/components/ui/StateMessage";
import { formatDate } from "@/lib/format";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getDeps } from "@/server/container";
import { listUsers, listUsersQuery } from "@/server/users/service";

export const metadata: Metadata = { title: "Users", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; page?: string }> }) {
  const access = await requirePageAccess("/admin/users", "user:manage");
  if ("denied" in access) return access.denied;
  const sp = await searchParams;
  const parsed = listUsersQuery.safeParse({ q: sp.q || undefined, role: sp.role || undefined, page: sp.page, pageSize: 15 });
  const q = parsed.success ? parsed.data : listUsersQuery.parse({ pageSize: 15 });
  const { items, meta } = await listUsers(getDeps(), access.ctx, q);
  const params: Record<string, string> = { ...(q.q ? { q: q.q } : {}), ...(q.role ? { role: q.role } : {}) };

  return (
    <div className="stack">
      <div className="page-head"><h1>Users and roles</h1></div>
      <form method="get" action="/admin/users" className="inline-form" role="search" aria-label="Find users">
        <div className="auth__field"><label htmlFor="uq">Name or email</label><input id="uq" name="q" defaultValue={q.q ?? ""} maxLength={100} /></div>
        <div className="auth__field"><label htmlFor="ur">Role</label>
          <select id="ur" name="role" defaultValue={q.role ?? ""}><option value="">Any</option>{["READER", "AUTHOR", "EDITOR", "ADMIN"].map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}</select>
        </div>
        <button type="submit" className="btn btn--secondary btn--md">Search</button>
        {q.q || q.role ? <Link href="/admin/users" className="btn btn--ghost btn--md">Clear</Link> : null}
      </form>
      {items.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="visually-hidden">Users</caption>
            <thead><tr><th scope="col">Person</th><th scope="col">Joined</th><th scope="col">Roles</th></tr></thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <th scope="row">{u.name}<br /><span className="muted">{u.email}{u.emailVerified ? "" : " (unverified)"}</span></th>
                  <td><time dateTime={u.createdAt}>{formatDate(u.createdAt)}</time></td>
                  <td><RoleEditor userId={u.id} name={u.name} roles={u.roles} canPublishDirectly={u.canPublishDirectly} isSelf={u.id === access.ctx.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <StateMessage kind="empty" title="No users match">Try a different search.</StateMessage>}
      <Pagination basePath="/admin/users" page={meta.page} totalPages={meta.totalPages} params={params} />
    </div>
  );
}
