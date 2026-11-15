import { z } from "zod";
import { Errors } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { getAuthContext } from "@/server/auth/current-user";
import { getDeps } from "@/server/container";
import { writeAudit } from "@/server/audit/audit";
import { clientIp, enforceRateLimit } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

const reportSchema = z.object({
  reason: z.enum(["MISINFORMATION", "COPYRIGHT", "HARASSMENT", "SPAM", "OTHER"]),
  details: z.string().trim().max(1000).optional(),
});

export const POST = route<{ params: Promise<{ idOrSlug: string }> }>(async (req, { params }) => {
  const deps = getDeps();
  const { idOrSlug } = await params;
  const ip = clientIp(req);
  if (ip !== "unknown") await enforceRateLimit(`article-report:ip:${ip}`, 10, 60 * 60_000);

  const viewer = await getAuthContext();
  const input = await readJson(req, reportSchema);

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const article = await deps.db.article.findFirst({
    where: UUID.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug },
    select: { id: true, title: true, slug: true, status: true },
  });

  if (!article) throw Errors.notFound("Article");

  await deps.db.$transaction(async (tx) => {
    await writeAudit(tx, {
      actorId: viewer?.id ?? null,
      action: "article.report",
      entityType: "Article",
      entityId: article.id,
      metadata: {
        reason: input.reason,
        details: input.details ?? null,
        title: article.title,
        slug: article.slug,
        ipHash: ip !== "unknown" ? "provided" : null,
      },
    });
  });

  return ok({ reported: true, message: "Thank you. Our editorial team has received your report." });
});
