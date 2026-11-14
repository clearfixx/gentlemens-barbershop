import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BookingBodyError } from './read-booking-body.ts'
import { MAX_BOOKING_STATUS_BODY_BYTES, readBookingStatusBody } from './read-booking-status-body.ts'

function request(body: BodyInit, headers?: HeadersInit): Request {
  return new Request('http://localhost/api/admin/bookings/42/status', {
    method: 'POST', body, headers, duplex: 'half',
  } as RequestInit)
}

async function rejected(body: Request, code: 400 | 413, message: string) {
  await assert.rejects(readBookingStatusBody(body), error =>
    error instanceof BookingBodyError && error.status === code && error.message === message)
}

test('status parser accepts only one status field without interpreting the action', async () => {
  assert.deepEqual(await readBookingStatusBody(request('{"status":"confirmed"}')), {
    status: 'confirmed',
  })
  assert.deepEqual(await readBookingStatusBody(request('{"status":null}')), { status: null })
})

test('status parser refuses extra fields, arrays, null, malformed JSON and invalid UTF-8', async () => {
  for (const body of ['{}', '{"status":"confirmed","actorId":1}', '[]', 'null', '42']) {
    await rejected(request(body), 400, 'Invalid status request')
  }
  await rejected(request('{"status":'), 400, 'Invalid JSON body')
  await rejected(request(new Uint8Array([0xff])), 400, 'Invalid JSON body')
})

test('status parser enforces exactly 128 UTF-8 bytes including misleading length', async () => {
  const exact = JSON.stringify({ status: 'a'.repeat(MAX_BOOKING_STATUS_BODY_BYTES - 13) })
  assert.equal(new TextEncoder().encode(exact).length, MAX_BOOKING_STATUS_BODY_BYTES)
  assert.deepEqual((await readBookingStatusBody(request(exact))).status,
    'a'.repeat(MAX_BOOKING_STATUS_BODY_BYTES - 13))
  await rejected(request(exact + ' '), 413, 'Request too large')
  await rejected(request('{"status":1}', { 'content-length': '129' }), 413, 'Request too large')
  await rejected(request('{"status":"ї'.repeat(45) + '"}'), 413, 'Request too large')
})

test('oversized status streams are cancelled without buffering the full body', async () => {
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(MAX_BOOKING_STATUS_BODY_BYTES + 1)) },
    cancel() { cancelled = true },
  })
  await rejected(request(stream, { 'content-length': '1' }), 413, 'Request too large')
  assert.equal(cancelled, true)
})

test('status parser accepts valid multibyte UTF-8 split across stream chunks', async () => {
  const bytes = new TextEncoder().encode('{"status":"ї"}')
  const split = bytes.indexOf(0xd1) + 1
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.subarray(0, split))
      controller.enqueue(bytes.subarray(split))
      controller.close()
    },
  })
  assert.deepEqual(await readBookingStatusBody(request(stream)), { status: 'ї' })
})
