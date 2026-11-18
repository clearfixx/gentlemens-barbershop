import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import type { HoldCaseStage } from './portfolio-hold-cases.ts'

export type HoldQueueStage = HoldCaseStage | 'untriaged' | 'open'
export type HoldQueueFilters = {
  stage?: string; location?: string; assignee?: string; page?: string
}
export type HoldQueueRow = {
  holdId: number; revisionId: number; mediaId: number
  locationId: number; barberId: number
  stage: HoldCaseStage | 'untriaged'
  assignedAdminId: number | null
  createdAt: string; lastActivityAt: string
  needsFollowup: boolean
}
export type HoldQueueActor = { id: number; role: 'admin' | 'location_admin' }

/** No claimant names or notes in the queue. "Follow up" is an operational
 * 7-day inactivity indicator, NOT a legally mandated SLA or deadline.
 */
export function parseHoldQueueFilters(filters: HoldQueueFilters): {
  stage: HoldQueueStage; page: number; locationId: number | null; assigneeId: number | null
} {
  const stage = filters.stage ?? 'open'
  if (!['open', 'untriaged', 'investigating', 'awaiting_information',
    'escalated', 'closed_administratively'].includes(stage)) {
    throw new RangeError('Invalid hold case stage')
  }
  const parseId = (input: string | undefined, label: string): number | null => {
    if (input === undefined || input === '') return null
    if (!/^[1-9][0-9]*$/.test(input) || !Number.isSafeInteger(Number(input))) {
      throw new RangeError(`Invalid ${label} filter`)
    }
    return Number(input)
  }
  const page = Number(filters.page ?? '1')
  if (!/^[1-9][0-9]{0,2}$/.test(filters.page ?? '1') ||
    !Number.isSafeInteger(page)) throw new RangeError('Invalid case queue page')
  return { stage: stage as HoldQueueStage, page,
    locationId: parseId(filters.location, 'location'),
    assigneeId: parseId(filters.assignee, 'assignee') }
}

export async function loadPortfolioHoldQueue(
  payload: Pick<Payload, 'db'>,
  actor: HoldQueueActor,
  filters: HoldQueueFilters,
): Promise<{ rows: HoldQueueRow[]; page: number; total: number;
  totalPages: number; stage: HoldQueueStage; locationId: number | null;
  assigneeId: number | null }> {
  if (!Number.isSafeInteger(actor.id) || actor.id <= 0 ||
    !['admin', 'location_admin'].includes(actor.role)) {
    throw new RangeError('Invalid hold queue identity')
  }
  const parsed = parseHoldQueueFilters(filters)
  const permission = actor.role === 'admin'
    ? sql`EXISTS (SELECT 1 FROM users u WHERE u.id = ${actor.id}
        AND u.role = 'admin'::public.enum_users_role)`
    : sql`EXISTS (
        SELECT 1 FROM users u JOIN location_assignments a ON a.user_id = u.id
        WHERE u.id = ${actor.id}
          AND u.role = 'location_admin'::public.enum_users_role
          AND a.is_active = TRUE AND a.location_id = r.location_id
      )`
  const byStage = parsed.stage === 'open'
    ? sql`COALESCE(latest.stage::text, 'untriaged') <> 'closed_administratively'`
    : sql`COALESCE(latest.stage::text, 'untriaged') = ${parsed.stage}`
  const location = parsed.locationId === null
    ? sql`TRUE` : sql`r.location_id = ${parsed.locationId}`
  const assignee = parsed.assigneeId === null
    ? sql`TRUE` : sql`latest.assigned_admin_id = ${parsed.assigneeId}`
  // The same SQL filter is applied to count and page selection. No complete
  // private dataset is fetched into application memory for pagination.
  const from = sql`
    FROM portfolio_media_precautionary_holds h
    JOIN barber_profile_revisions r ON r.id = h.revision_id
    LEFT JOIN LATERAL (
      SELECT e.stage, e.assigned_admin_id, e.created_at
      FROM portfolio_hold_case_events e
      WHERE e.hold_id = h.id ORDER BY e.id DESC LIMIT 1
    ) latest ON TRUE
    WHERE ${permission} AND ${byStage} AND ${location} AND ${assignee}
  `
  const count = await payload.db.drizzle.execute(sql`
    SELECT count(*)::int AS total ${from}
  `)
  const total = Number(count.rows[0]?.total)
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid hold queue count')
  const offset = (parsed.page - 1) * 20
  const found = await payload.db.drizzle.execute(sql`
    SELECT h.id AS hold_id, h.revision_id, h.media_id,
      r.barber_id, r.location_id,
      COALESCE(latest.stage::text, 'untriaged') AS stage,
      latest.assigned_admin_id, h.created_at::text AS created_at,
      COALESCE(latest.created_at, h.created_at)::text AS last_activity_at,
      (COALESCE(latest.stage::text, 'untriaged') <> 'closed_administratively'
        AND COALESCE(latest.created_at, h.created_at) <= NOW() - INTERVAL '7 days')
        AS needs_followup
    ${from}
    ORDER BY
      (COALESCE(latest.stage::text, 'untriaged') <> 'closed_administratively'
        AND COALESCE(latest.created_at, h.created_at) <= NOW() - INTERVAL '7 days') DESC,
      COALESCE(latest.created_at, h.created_at) ASC, h.id ASC
    LIMIT 20 OFFSET ${offset}
  `)
  if (found.rows.length > 20) throw new Error('Unexpected hold queue size')
  const validStage = ['untriaged', 'investigating', 'awaiting_information',
    'escalated', 'closed_administratively']
  const rows: HoldQueueRow[] = found.rows.map(record => {
    const n = (v: unknown): number => {
      const id = Number(v)
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid case relation')
      return id
    }
    const stage = String(record.stage)
    if (!validStage.includes(stage) || typeof record.needs_followup !== 'boolean') {
      throw new Error('Invalid case stage')
    }
    return {
      holdId: n(record.hold_id), revisionId: n(record.revision_id),
      mediaId: n(record.media_id), locationId: n(record.location_id),
      barberId: n(record.barber_id), stage: stage as HoldQueueRow['stage'],
      assignedAdminId: record.assigned_admin_id === null
        ? null : n(record.assigned_admin_id),
      createdAt: String(record.created_at),
      lastActivityAt: String(record.last_activity_at),
      needsFollowup: record.needs_followup,
    }
  })
  return { rows, total, totalPages: Math.ceil(total / 20), page: parsed.page,
    stage: parsed.stage, locationId: parsed.locationId, assigneeId: parsed.assigneeId }
}
