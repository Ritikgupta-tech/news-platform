import { z } from "zod";
import { paginationSchema } from "@/lib/api/pagination";

const httpUrl = z.string().url().max(500).refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL");
const tagName = z.string().trim().min(2).max(40);
const slugParam = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,100}$/);

export const articleFields = z.object({
  title: z.string().trim().min(5).max(200),
  subtitle: z.string().trim().max(300).nullish(),
  summary: z.string().trim().min(10).max(500),
  bodyHtml: z.string().min(1).max(200_000),
  categoryId: z.string().uuid(),
  tags: z.array(tagName).max(10),
  heroImageId: z.string().uuid().nullish(),
  sourceName: z.string().trim().max(120).nullish(),
  sourceUrl: httpUrl.nullish(),
});

export const createArticleSchema = articleFields.extend({ tags: articleFields.shape.tags.default([]) });

export const updateArticleSchema = articleFields.partial().extend({
  /** The version the client loaded. A mismatch means someone else saved first (409). */
  version: z.number().int().min(1),
  changeNote: z.string().trim().max(300).optional(),
});

export const listArticlesQuery = paginationSchema.extend({
  scope: z.enum(["public", "mine", "review", "all"]).default("public"),
  category: slugParam.optional(),
  tag: slugParam.optional(),
  author: slugParam.optional(),
  status: z.enum(["DRAFT", "SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "SCHEDULED", "PUBLISHED", "ARCHIVED"]).optional(),
});

export type CreateArticleInput = z.infer<typeof createArticleSchema>;
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;
export type ListArticlesQuery = z.infer<typeof listArticlesQuery>;
