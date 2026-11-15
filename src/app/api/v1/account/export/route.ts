import { NextResponse } from "next/server";
import { route } from "@/lib/api/response";
import { exportData } from "@/server/account/service";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";

export const dynamic = "force-dynamic";

/** Downloads everything held about the signed-in person as a JSON file. */
export const GET = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  const data = await exportData(deps, ctx.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="my-data-${data.exportedAt.slice(0, 10)}.json"`, "Cache-Control": "private, no-store" },
  });
});
