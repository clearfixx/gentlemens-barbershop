/**
 * Read untrusted booking JSON with a hard byte limit. Request.text() buffers
 * the entire body before length checks, allowing very large allocations.
 */
export class BookingBodyError extends Error {
  readonly status: 400 | 413

  constructor(status: 400 | 413, message: string) {
    super(message)
    this.name = 'BookingBodyError'
    this.status = status
  }
}

export const MAX_BOOKING_BODY_BYTES = 8192

export async function readBookingBody(
  request: Request,
  maxBytes = MAX_BOOKING_BODY_BYTES,
): Promise<unknown> {
  const declaredLength = request.headers.get('content-length')
  if (declaredLength !== null && /^\d+$/.test(declaredLength) &&
      Number(declaredLength) > maxBytes) {
    throw new BookingBodyError(413, 'Booking body too large')
  }

  if (!request.body) throw new BookingBodyError(400, 'Invalid JSON body')
  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let text = ''
  let completed = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        completed = true
        break
      }
      bytes += value.byteLength
      if (bytes > maxBytes) throw new BookingBodyError(413, 'Booking body too large')
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return JSON.parse(text) as unknown
  } catch (error) {
    if (error instanceof BookingBodyError) throw error
    if (error instanceof SyntaxError || error instanceof TypeError) {
      throw new BookingBodyError(400, 'Invalid JSON body')
    }
    throw error
  } finally {
    if (!completed) {
      // A deliberately oversized stream may never end. Stop reading it.
      await reader.cancel().catch(() => undefined)
    }
    reader.releaseLock()
  }
}
