const buckets = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const LIMIT = 20;

export function checkRateLimit(key: string, now = Date.now()) {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (buckets.size > 5_000)
      for (const [bucketKey, bucket] of buckets)
        if (bucket.resetAt <= now) buckets.delete(bucketKey);
    return { allowed: true, retryAfterSeconds: 0 };
  }
  current.count++;
  return {
    allowed: current.count <= LIMIT,
    retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
  };
}
