import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ArticleStatus, PrismaClient } from "@prisma/client";
import { connect, ctxFor, makeDeps, makeUser, resetDatabase, TEST_DB_URL } from "./helpers";
import { createArticle } from "../../src/server/articles/service";
import { applyAction } from "../../src/server/editorial/service";
import { availableActions } from "../../src/server/editorial/actions";
import { ACTIONS, type EditorialAction } from "../../src/server/editorial/validation";
import { ARTICLE_STATUSES } from "../../src/lib/workflow";
import { ZodError } from "zod";

/** The UI's idea of "allowed" must match what the server really permits, for every role and every status. */
describe.skipIf(!TEST_DB_URL)("UI actions agree with the server (real Postgres)", () => {
  let db: PrismaClient;
  beforeAll(() => { db = connect(); });
  afterAll(async () => { await db.$disconnect(); });

  it("matches for all roles x statuses x actions", async () => {
    await resetDatabase(db);
    const deps = makeDeps(db);
    const techId = (await db.category.findUniqueOrThrow({ where: { slug: "technology" } })).id;
    const ownerUser = await makeUser(db, "AUTHOR");
    const granted = await makeUser(db, "AUTHOR");
    await db.authorProfile.update({ where: { userId: granted.id }, data: { canPublishDirectly: true } });
    const people = {
      "owner author": ownerUser.id,
      "granted author (owner)": granted.id,
      "other author": (await makeUser(db, "AUTHOR")).id,
      "reader": (await makeUser(db, "READER")).id,
      "editor (not owner)": (await makeUser(db, "EDITOR")).id,
      "admin (not owner)": (await makeUser(db, "ADMIN")).id,
    };
    const ownerEditor = await makeUser(db, "EDITOR");
    const ownerAdmin = await makeUser(db, "ADMIN");
    const cases: [string, string, string][] = [ // [label, actor id, article author id]
      ...Object.entries(people).map(([label, id]) => [label, id, label === "granted author (owner)" ? granted.id : ownerUser.id] as [string, string, string]),
      ["editor (owner)", ownerEditor.id, ownerEditor.id],
      ["admin (owner)", ownerAdmin.id, ownerAdmin.id],
    ];

    const future = new Date(Date.now() + 3600_000).toISOString();
    const bodyFor = (action: EditorialAction, version: number) => ({ version, ...(action === "schedule" ? { scheduledFor: future } : {}), ...(action === "reject" || action === "request-changes" ? { reason: "A sufficiently long reason." } : {}) });
    const mismatches: string[] = [];
    let checked = 0;

    for (const [label, actorId, authorId] of cases) {
      const authorCtx = await ctxFor(db, authorId);
      const article = await createArticle(deps, authorCtx, { title: `Consistency ${label}`, summary: "Summary for consistency.", bodyHtml: "<p>Body.</p>", categoryId: techId, tags: [] });
      for (const status of ARTICLE_STATUSES) {
        for (const action of ACTIONS) {
          const reset = () => db.article.update({ where: { id: article.id }, data: { status: status as ArticleStatus, scheduledFor: status === "SCHEDULED" ? new Date(Date.now() + 3600_000) : null, publishedAt: status === "PUBLISHED" ? new Date() : null, deletedAt: null } });
          await reset();
          const ctx = await ctxFor(db, actorId);
          const listed = availableActions(ctx, { authorId, status }).some((a) => a.action === action);
          let allowed = true;
          try { await applyAction(deps, ctx, article.id, action, bodyFor(action, article.version)); }
          catch (e) {
            if (e instanceof ZodError) throw e;
            allowed = false;
            const code = (e as { code?: string }).code;
            if (!["FORBIDDEN", "NOT_FOUND", "INVALID_TRANSITION"].includes(code ?? "")) mismatches.push(`${label} / ${status} / ${action}: unexpected error ${code}`);
          }
          checked++;
          if (listed !== allowed) mismatches.push(`${label} / ${status} / ${action}: UI says ${listed}, server says ${allowed}`);
        }
      }
    }
    expect(checked).toBe(cases.length * ARTICLE_STATUSES.length * ACTIONS.length);
    expect(mismatches).toEqual([]);
  }, 120_000);
});
