import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Postgres-backed fixed-window rate limiter using `public.rate_limits`.
 * Default: 5 attempts per 15-minute window.
 */
export async function checkRateLimit(
  key: string,
  maxPoints = 5,
  windowSeconds = 900
): Promise<RateLimitResult> {
  const admin = createAdminClient();
  const now = new Date();
  const windowMs = windowSeconds * 1000;

  const { data: existing } = await admin
    .from("rate_limits")
    .select("key, points, window_start")
    .eq("key", key)
    .maybeSingle();

  if (!existing) {
    await admin.from("rate_limits").insert({
      key,
      points: 1,
      window_start: now.toISOString(),
    });
    return {
      allowed: true,
      remaining: Math.max(0, maxPoints - 1),
      resetAt: new Date(now.getTime() + windowMs),
    };
  }

  const windowStart = new Date(existing.window_start);
  const elapsed = now.getTime() - windowStart.getTime();

  if (elapsed >= windowMs) {
    await admin
      .from("rate_limits")
      .update({
        points: 1,
        window_start: now.toISOString(),
      })
      .eq("key", key);
    return {
      allowed: true,
      remaining: Math.max(0, maxPoints - 1),
      resetAt: new Date(now.getTime() + windowMs),
    };
  }

  if (existing.points >= maxPoints) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(windowStart.getTime() + windowMs),
    };
  }

  const nextPoints = existing.points + 1;
  await admin
    .from("rate_limits")
    .update({ points: nextPoints })
    .eq("key", key);

  return {
    allowed: true,
    remaining: Math.max(0, maxPoints - nextPoints),
    resetAt: new Date(windowStart.getTime() + windowMs),
  };
}
