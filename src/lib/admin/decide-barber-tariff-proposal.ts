import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import {
  decideCommercialChange,
  type ApprovalDecision,
  type CommercialActor,
  type CommercialChange,
} from './commercial-approval-policy.ts'
import { tariffRevision } from './prepare-barber-tariff-proposal.ts'

type LockedProposal = {
  id: unknown
  location_id: unknown
  created_by_id: unknown
  kind: unknown
  status: unknown
  service_id: unknown
  barber_id: unknown
  old_value: unknown
  proposed_value: unknown
  expected_revision: unknown
  barber_location_id: unknown
  barber_updated_at: unknown
  service_updated_at: unknown
  service_price: unknown
  service_duration: unknown
  offering_id: unknown
  price_override: unknown
  duration_override: unknown
}

function numeric(value: unknown): number {
  const n = typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)
    ? Number(value) : value
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) {
    throw new Error('Invalid persisted commercial value')
  }
  return n
}
function id(value: unknown): number {
  const n = numeric(value)
  if (n <= 0) throw new Error('Invalid persisted commercial identity')
  return n
}
function stamp(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString()
  }
  throw new Error('Invalid persisted commercial timestamp')
}

/** Atomically approve/reject a barber-specific tariff.
 *
 * Lock approval + barber + service + offering rows before comparing the exact
 * server-generated revision. No HTTP input controls old price, scope or status.
 * Global base service changes intentionally NOT supported: those require a
 * separate location-scoped pricing model before any approval can apply.
 */
export async function decideBarberTariffProposal(
  payload: Pick<Payload, 'db'>,
  proposalId: number,
  networkAdmin: { id: number; role: string },
  decision: ApprovalDecision,
): Promise<{ id: number; status: 'approved' | 'rejected' }> {
  if (!Number.isSafeInteger(proposalId) || proposalId <= 0 ||
      networkAdmin.role !== 'admin' || !Number.isSafeInteger(networkAdmin.id) ||
      networkAdmin.id <= 0) {
    throw new Error('Commercial decision forbidden')
  }
  return payload.db.drizzle.transaction(async tx => {
    const result = await tx.execute(sql`
      SELECT r.id, r.location_id, r.created_by_id, r.kind::text AS kind,
        r.status::text AS status, r.service_id, r.barber_id, r.old_value,
        r.proposed_value, r.expected_revision,
        b.location_id AS barber_location_id,
        b.updated_at AS barber_updated_at,
        s.updated_at AS service_updated_at,
        s.price AS service_price,
        s.duration_minutes AS service_duration,
        o.id AS offering_id,
        o.price_override, o.duration_override_minutes AS duration_override
      FROM commercial_change_requests AS r
      JOIN barbers AS b ON b.id = r.barber_id
      JOIN services AS s ON s.id = r.service_id
      JOIN barbers_service_offerings AS o
        ON o._parent_id = b.id AND o.service_id = s.id
      WHERE r.id = ${proposalId}
      FOR UPDATE OF r, b, s, o
    `)
    if (result.rows.length !== 1) {
      throw new Error('Missing or ambiguous commercial proposal target')
    }
    const row = result.rows[0] as LockedProposal
    // Check the terminal state before checking live tariff drift: a replayed
    // decision must always be reported as already processed.
    if (row.status !== 'pending') {
      throw new Error('Commercial proposal is no longer pending')
    }
    const locationId = id(row.location_id)
    const barberId = id(row.barber_id)
    const serviceId = id(row.service_id)
    if (id(row.barber_location_id) !== locationId ||
        (row.kind !== 'barber_price' && row.kind !== 'barber_duration') ||
        typeof row.expected_revision !== 'string' ||
        typeof row.offering_id !== 'string') {
      throw new Error('Commercial proposal target is invalid or outside its location')
    }
    const isPrice = row.kind === 'barber_price'
    const baseValue = numeric(isPrice ? row.service_price : row.service_duration)
    const rawOverride = isPrice ? row.price_override : row.duration_override
    const overrideValue = rawOverride === null ? null : numeric(rawOverride)
    const currentValue = overrideValue ?? baseValue
    const proposedValue = numeric(row.proposed_value)
    const oldValue = numeric(row.old_value)
    if (currentValue !== oldValue) {
      throw new Error('Commercial proposal is stale; tariff changed')
    }
    const revision = tariffRevision({
      locationId, barberId, serviceId, kind: row.kind,
      baseValue, overrideValue,
      barberUpdatedAt: stamp(row.barber_updated_at),
      serviceUpdatedAt: stamp(row.service_updated_at),
    })
    const actor: CommercialActor = {
      userId: networkAdmin.id,
      role: 'admin',
      locationIds: [],
    }
    const change: CommercialChange = {
      id: id(row.id), locationId, kind: row.kind,
      status: row.status as CommercialChange['status'],
      createdBy: id(row.created_by_id), expectedRevision: row.expected_revision,
      oldValue, proposedValue,
    }
    const outcome = decideCommercialChange(actor, change, decision, revision)
    if (outcome.status === 'approved') {
      const changed = isPrice
        ? await tx.execute(sql`
          UPDATE barbers_service_offerings
          SET price_override = ${proposedValue}
          WHERE id = ${row.offering_id} AND _parent_id = ${barberId} AND service_id = ${serviceId}
          RETURNING id
        `)
        : await tx.execute(sql`
          UPDATE barbers_service_offerings
          SET duration_override_minutes = ${proposedValue}
          WHERE id = ${row.offering_id} AND _parent_id = ${barberId} AND service_id = ${serviceId}
          RETURNING id
        `)
      if (changed.rows.length !== 1) throw new Error('Commercial offering update failed')
      const updated = await tx.execute(sql`
        UPDATE barbers SET updated_at = NOW() WHERE id = ${barberId} RETURNING id
      `)
      if (updated.rows.length !== 1) throw new Error('Commercial barber update failed')
    }
    const recorded = await tx.execute(sql`
      UPDATE commercial_change_requests
      SET status = ${outcome.status}::public.enum_commercial_change_requests_status,
        decided_by_id = ${outcome.decidedBy},
        decided_at = NOW(),
        decision_reason = ${outcome.reason},
        updated_at = NOW()
      WHERE id = ${proposalId}
        AND status = 'pending'::public.enum_commercial_change_requests_status
      RETURNING id
    `)
    if (recorded.rows.length !== 1) throw new Error('Commercial decision conflict')
    return { id: proposalId, status: outcome.status }
  })
}
