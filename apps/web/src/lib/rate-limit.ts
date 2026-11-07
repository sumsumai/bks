import { AppError } from "./errors";

// Fixed-window, per-process limiter for public endpoints. Good enough for one instance; use Redis
// (or the platform's firewall rules) when running several.
const hits = new Map<string, { count: number; reset: number }>();

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export function rateLimit(req: Request, bucket: string, limit: number, windowMs: number) {
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    if (hits.size > 50_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return;
  }
  if (++h.count > limit) throw new AppError(429, "rate_limited", "Too many requests, please slow down");
}
