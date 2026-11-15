import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  CRON_SECRET: z.string().min(32, "CRON_SECRET must be at least 32 chars").optional(),
  TRUST_PROXY: z.enum(["0", "1"]).default("0"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Lazily validated so tests and builds that don't need secrets still work. */
export function getEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (source === process.env && cached) return cached;
  const rawAppUrl = source.APP_URL || source.RENDER_EXTERNAL_URL || (source.VERCEL_URL ? `https://${source.VERCEL_URL}` : undefined);
  const dataToParse = { ...source, ...(rawAppUrl ? { APP_URL: rawAppUrl } : {}) };
  const parsed = schema.safeParse(dataToParse);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}
