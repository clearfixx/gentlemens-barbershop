import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

export type HoldCaseStage =
  'investigating' | 'awaiting_information' | 'escalated' | 'closed_administratively'
export class HoldCaseConflict extends Error {
  constructor(message = 'Precautionary hold case unavailable') {
    super(message)
    this.name = 'HoldCaseConflict'
  }
}

export function parseHoldCaseEvent(input: unknown): {
  stage: HoldCaseStage; assignedAdminId: number; note: string
} {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== 3) throw new RangeError('Invalid case event')
  const o = input as Record<string, unknown>
  if (!['investigating', 'awaiting_information', 'escalated',
    'closed_administratively'].includes(String(o.stage)) ||
    !Number.isSafeInteger(o.assignedAdminId) ||
    (o.assignedAdminId as number) <= 0 ||
    typeof o.note !== 'string' || o.note.trim().length < 5 ||
    o.note.trim().length > 1000) throw new RangeError('Invalid case event details')
  return { stage: o.stage as HoldCaseStage,
    assignedAdminId: o.assignedAdminId as number, note: o.note.trim() }
}

/** Case tracking, not claimant identification or consent certification.
 * Lock the permanent hold, check CURRENT network admin roles and current
 * stage, and append a new event; no code path can clear the hold.
 */
export async function recordPortfolioHoldCaseEvent(
  payload: Pick<Payload, 'db'>,
  actor: { id: number; role: string },
  holdId: number,
  input: unknown,
): Promise<{ id: number; holdId: number; stage: HoldCaseStage; assignedAdminId: number }> {
  if (actor.role !== 'admin' || !Number.isSafeInteger(actor.id) || actor.id <= 0 ||
      !Number.isSafeInteger(holdId) || holdId <= 0) throw new HoldCaseConflict()
  const decision = parseHoldCaseEvent(input)
  return payload.db.drizzle.transaction(async tx => {
    const held = await tx.execute(sql`
      SELECT h.id FROM portfolio_media_precautionary_holds h
      JOIN barber_profile_revisions r ON r.id = h.revision_id
      WHERE h.id = ${holdId}
      FOR UPDATE OF h, r
    `)
    if (held.rows.length !== 1) throw new HoldCaseConflict()
    const current = await tx.execute(sql`
      SELECT stage::text AS stage FROM portfolio_hold_case_events
      WHERE hold_id = ${holdId} ORDER BY id DESC LIMIT 1
    `)
    if (current.rows[0]?.stage === 'closed_administratively') {
      throw new HoldCaseConflict('Administrative case already closed')
    }
    if (current.rows.length === 0 && decision.stage === 'closed_administratively') {
      throw new HoldCaseConflict('Case must be triaged before closing')
    }
    const actorAndAssignee = await tx.execute(sql`
      SELECT id FROM users
      WHERE id IN (${actor.id}, ${decision.assignedAdminId})
        AND role = 'admin'::public.enum_users_role
      FOR SHARE
    `)
    const found = new Set(actorAndAssignee.rows.map(row => Number(row.id)))
    if (!found.has(actor.id) || !found.has(decision.assignedAdminId)) {
      throw new HoldCaseConflict('Actor or assignee lost network-admin privileges')
    }
    const event = await tx.execute(sql`
      INSERT INTO portfolio_hold_case_events
        (hold_id, actor_id, assigned_admin_id, stage, note)
      VALUES (${holdId}, ${actor.id}, ${decision.assignedAdminId},
        ${decision.stage}::public.enum_portfolio_hold_case_stage,
        ${decision.note})
      RETURNING id
    `)
    if (event.rows.length !== 1) throw new HoldCaseConflict('Case audit insert failed')
    return { id: Number(event.rows[0].id), holdId, stage: decision.stage,
      assignedAdminId: decision.assignedAdminId }
  })
}

export type HoldCaseSummary = { holdId: number; mediaId: number; stage: HoldCaseStage | 'untriaged';
  assignedAdminId: number | null }

/** Scope-check at DB query time. No notes, identity details or case refs. */
export async function listPortfolioHoldCases(
  payload: Pick<Payload, 'db'>,
  actor: { id: number; role: 'admin' | 'location_admin' },
  revisionId: number,
): Promise<HoldCaseSummary[]> {
  if (!Number.isSafeInteger(actor.id) || actor.id <= 0 ||
      !Number.isSafeInteger(revisionId) || revisionId <= 0 ||
      !['admin', 'location_admin'].includes(actor.role)) throw new RangeError('Invalid case scope')
  const access = actor.role === 'admin'
    ? sql`EXISTS (SELECT 1 FROM users u WHERE u.id = ${actor.id}
        AND u.role = 'admin'::public.enum_users_role)`
    : sql`EXISTS (SELECT 1 FROM users u JOIN location_assignments a ON a.user_id = u.id
        WHERE u.id = ${actor.id} AND u.role = 'location_admin'::public.enum_users_role
        AND a.location_id = r.location_id AND a.is_active = TRUE)`
  const records = await payload.db.drizzle.execute(sql`
    SELECT h.id AS hold_id, h.media_id, latest.stage::text AS stage,
      latest.assigned_admin_id
    FROM portfolio_media_precautionary_holds h
    JOIN barber_profile_revisions r ON r.id = h.revision_id
    LEFT JOIN LATERAL (
      SELECT stage, assigned_admin_id
      FROM portfolio_hold_case_events
      WHERE hold_id = h.id ORDER BY id DESC LIMIT 1
    ) latest ON TRUE
    WHERE r.id = ${revisionId} AND ${access}
    ORDER BY h.id ASC LIMIT 31
  `)
  if (records.rows.length > 30) throw new Error('Unexpected number of cases')
  return records.rows.map(row => {
    const holdId = Number(row.hold_id), mediaId = Number(row.media_id)
    const stage = row.stage ?? 'untriaged'
    const assignedAdminId = row.assigned_admin_id === null ? null : Number(row.assigned_admin_id)
    if (![holdId, mediaId].every(n => Number.isSafeInteger(n) && n > 0) ||
      !['untriaged', 'investigating', 'awaiting_information', 'escalated',
        'closed_administratively'].includes(stage) ||
      (assignedAdminId !== null && (!Number.isSafeInteger(assignedAdminId) || assignedAdminId <= 0))) {
      throw new Error('Malformed hold case summary')
    }
    return { holdId, mediaId, stage: stage as HoldCaseSummary['stage'], assignedAdminId }
  })
}
