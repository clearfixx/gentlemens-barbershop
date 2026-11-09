/**
 * Bounded per-process request throttle. This protects a single Next.js worker
 * from accidental bursts; it is NOT a distributed rate limiter. Deployments
 * with multiple workers must also enforce limits at the edge/proxy.
 */
export class FixedWindowLimiter {
  private readonly buckets = new Map<string, { count: number; resetsAt: number }>()
  private readonly limit: number
  private readonly windowMs: number
  private readonly maxKeys: number
  constructor(limit = 30, windowMs = 60_000, maxKeys = 5000) {
    this.limit = limit
    this.windowMs = windowMs
    this.maxKeys = maxKeys
  }

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

export const availabilityLimiter = new FixedWindowLimiter(120, 60_000, 1)

/** Worker-wide budget: cannot be bypassed with spoofed client headers. */
export function requestRateLimitKey(_request: Request): string {
  return 'availability-worker'
}
