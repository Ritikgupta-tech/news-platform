import { z } from "zod";

export const MAX_PAGE_SIZE = 50;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(10),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function toSkipTake({ page, pageSize }: Pagination) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

export function buildPageMeta(p: Pagination, total: number): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / p.pageSize));
  return { page: p.page, pageSize: p.pageSize, total, totalPages, hasNext: p.page < totalPages };
}
