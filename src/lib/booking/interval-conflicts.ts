/** UTC appointment intervals. End is exclusive, so adjacent visits are valid. */
export type AppointmentInterval = {
  startsAt: Date
  endsAt: Date
}

export function intervalsOverlap(a: AppointmentInterval, b: AppointmentInterval): boolean {
  for (const interval of [a, b]) {
    if (!Number.isFinite(interval.startsAt.getTime()) ||
        !Number.isFinite(interval.endsAt.getTime()) ||
        interval.startsAt >= interval.endsAt) {
      throw new RangeError('Appointment intervals must have valid increasing timestamps')
    }
  }
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt
}

/**
 * Advisory validation only: a read-then-write check is not concurrency safe.
 * A PostgreSQL exclusion constraint or equivalent transactional lock is
 * required before enabling customer-facing booking writes.
 */
export function hasAppointmentConflict(
  candidate: AppointmentInterval,
  existing: AppointmentInterval[],
): boolean {
  return existing.some(appointment => intervalsOverlap(candidate, appointment))
}
