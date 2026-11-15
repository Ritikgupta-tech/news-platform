import { Errors } from "@/lib/api/errors";

export interface RateLimitResult { allowed: boolean; retryAfterSec: number; remaining: number }

/** Swap for a Redis-backed implementation when running more than one instance. */
export interface RateLimiter {
  hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

interface Bucket { count: number; resetAt: number }

/** Fixed-window, in-process limiter. Correct for a single instance and for tests. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  constructor(private readonly now: () => number = Date.now, private readonly maxKeys = 50_000) {}

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const t = this.now();
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= t) {
      if (this.buckets.size >= this.maxKeys) this.prune(t);
      b = { count: 0, resetAt: t + windowMs };
      this.buckets.set(key, b);
    }
    b.count += 1;
    const allowed = b.count <= limit;
    return { allowed, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - t) / 1000)), remaining: Math.max(0, limit - b.count) };
  }

  private prune(t: number) {
    for (const [k, v] of this.buckets) if (v.resetAt <= t) this.buckets.delete(k);
    if (this.buckets.size >= this.maxKeys) this.buckets.clear(); // memory-safety valve under attack
  }
}

const g = globalThis as unknown as { __rateLimiter?: RateLimiter };
export const getRateLimiter = (): RateLimiter => (g.__rateLimiter ??= new MemoryRateLimiter());
export const setRateLimiter = (l: RateLimiter | undefined): void => { g.__rateLimiter = l; };

export async function enforceRateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  const r = await getRateLimiter().hit(key, limit, windowMs);
  if (!r.allowed) throw Errors.rateLimited(r.retryAfterSec);
}

/** Client IP. X-Forwarded-For is honoured only when TRUST_PROXY=1 (i.e. behind your own proxy). */
export function clientIp(req: Request, trustProxy = process.env.TRUST_PROXY === "1"): string {
  if (trustProxy) {
    const xff = req.headers.get("x-forwarded-for");
    const first = xff?.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
    const real = req.headers.get("x-real-ip");
    if (real) return real.slice(0, 64);
  }
  return "unknown";
}
