import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BookingBodyError, MAX_BOOKING_BODY_BYTES, readBookingBody } from './read-booking-body.ts'

function request(body: BodyInit, headers?: HeadersInit): Request {
  return new Request('http://localhost/api/bookings', { method: 'POST', body, headers, duplex: 'half' } as RequestInit)
}

test('reads a valid JSON booking body', async () => {
  assert.deepEqual(await readBookingBody(request('{"barberId":1}')), { barberId: 1 })
})

test('accepts a body exactly at the byte limit', async () => {
  const json = JSON.stringify({ text: 'a'.repeat(MAX_BOOKING_BODY_BYTES - 11) })
  assert.equal(new TextEncoder().encode(json).byteLength, MAX_BOOKING_BODY_BYTES)
  assert.equal((await readBookingBody(request(json)) as { text: string }).text.length, MAX_BOOKING_BODY_BYTES - 11)
})

test('rejects declared oversized content before reading', async () => {
  const input = request('{}', { 'content-length': String(MAX_BOOKING_BODY_BYTES + 1) })
  await assert.rejects(readBookingBody(input), (error: unknown) =>
    error instanceof BookingBodyError && error.status === 413)
})

test('rejects oversized streamed bytes even if content-length is missing or false', async () => {
  for (const headers of [undefined, { 'content-length': '1' }]) {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_BOOKING_BODY_BYTES + 1))
      },
      cancel() { cancelled = true },
    })
    const input = request(stream, headers)
    await assert.rejects(readBookingBody(input), (error: unknown) =>
      error instanceof BookingBodyError && error.status === 413)
    assert.equal(cancelled, true)
  }
})

test('counts UTF-8 bytes, not JavaScript string characters', async () => {
  const text = JSON.stringify({ text: 'ї'.repeat(5000) })
  assert.ok(text.length < MAX_BOOKING_BODY_BYTES)
  await assert.rejects(readBookingBody(request(text)), (error: unknown) =>
    error instanceof BookingBodyError && error.status === 413)
})

test('rejects malformed JSON and invalid UTF-8 with status 400', async () => {
  await assert.rejects(readBookingBody(request('{')), (error: unknown) =>
    error instanceof BookingBodyError && error.status === 400)
  await assert.rejects(readBookingBody(request(new Uint8Array([0xff]))), (error: unknown) =>
    error instanceof BookingBodyError && error.status === 400)
})

test('decodes UTF-8 characters split across stream chunks', async () => {
  const bytes = new TextEncoder().encode('{"name":"ї"}')
  const split = bytes.indexOf(0xd1) + 1
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.subarray(0, split))
      controller.enqueue(bytes.subarray(split))
      controller.close()
    },
  })
  assert.deepEqual(await readBookingBody(request(stream)), { name: 'ї' })
})
