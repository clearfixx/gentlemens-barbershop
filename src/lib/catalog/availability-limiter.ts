/**
 * Bounded per-process request throttle. This protects a single Next.js worker
 * from accidental bursts; it is NOT a distributed rate limiter. Deployments
 * with multiple workers must also enforce limits at the edge/proxy.
 */
export class FixedWindowLimiter {
  private readonly buckets = new Map<string, { count: number; resetsAt: number }>()
  constructor(
    private readonly limit = 30,
    private readonly windowMs = 60_000,
    private readonly maxKeys = 5000,
  ) {}

  check(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const existing = this.buckets.get(key)
    if (existing && now < existing.resetsAt) {
      if (existing.count >= this.limit) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetsAt - now) / 1000)) }
      }
      existing.count++
      return { allowed: true, retryAfterSeconds: 0 }
    }
    if (this.buckets.size >= this.maxKeys) {
      for (const [id, bucket] of this.buckets) {
        if (now >= bucket.resetsAt) this.buckets.delete(id)
      }
    }
    // Fail closed when too many distinct keys are active; never grow unbounded.
    if (this.buckets.size >= this.maxKeys && !this.buckets.has(key)) {
      return { allowed: false, retryAfterSeconds: Math.ceil(this.windowMs / 1000) }
    }
    this.buckets.set(key, { count: 1, resetsAt: now + this.windowMs })
    return { allowed: true, retryAfterSeconds: 0 }
  }
}

export const availabilityLimiter = new FixedWindowLimiter()

/** Only trust the direct socket peer when no trusted proxy has been configured. */
export function requestRateLimitKey(request: Request): string {
  // The caller cannot select an arbitrary identity via X-Forwarded-For.
  // With a trusted reverse proxy, configure the proxy to enforce IP limits.
  const userAgent = request.headers.get('user-agent')?.slice(0, 100) ?? ''
  // This coarse key deliberately limits all callers sharing the same worker
  // and user agent. It is a defensive fallback, not a substitute for edge limits.
  return userAgent || 'unknown-client'
}
