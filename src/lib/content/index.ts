import { prismaContentRepository } from "./prisma-repository";
import type { ContentRepository } from "./types";

/** Single access point for public-page data. Tests and previews alias this module to an in-memory repository. */
export function getContent(): ContentRepository {
  return prismaContentRepository;
}

export type { ContentRepository } from "./types";
