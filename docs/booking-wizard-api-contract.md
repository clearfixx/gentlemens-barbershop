# Booking wizard — server API contract

The canonical source for availability and booking price is the server catalog.
Frontend state must **never** decide the final price, duration, schedule or booking status.

## Data flow

1. The visitor selects a **location**, then one of its active **barbers**.
2. The visitor selects **1–10 distinct services** offered by that barber.
3. Request availability for the **whole selection** (repeat the `service` query key):

   ```http
   GET /api/availability?barber=2&service=3&service=4&date=2026-11-20
   ```

   The date is the shop's **local calendar date**, formatted `YYYY-MM-DD`.
   The endpoint accepts dates within the existing ~31-day booking window.
   Repeated identical service IDs, missing/invalid values, more than 10 services and unknown query keys return 400.

   A successful response has the following shape:

   ```json
   {
     "barberId": 2,
     "serviceIds": [3, 4],
     "locationId": 1,
     "timeZone": "Europe/Kyiv",
     "date": "2026-11-20",
     "durationMinutes": 90,
     "price": 1050,
     "slots": [
       { "startsAt": "2026-11-20T09:00:00.000Z", "endsAt": "2026-11-20T10:30:00.000Z" }
     ]
   }
   ```

   *All times in `slots` are UTC instants.* Display them in `timeZone`, but submit `startsAt` **unchanged**. For legacy single-service calls, the response also retains `serviceId`. Pricing/duration are always derived from trusted catalog data and barber-specific overrides. Inactive, missing or unoffered services return 404.

4. On the contact step, the signed-in customer may submit the combination:

   ```http
   POST /api/bookings
   Content-Type: application/json
   Idempotency-Key: unique-client-retry-token-1234
   ```

   ```json
   {
     "locationId": 1,
     "barberId": 2,
     "serviceIds": [3, 4],
     "startsAt": "2026-11-20T09:00:00.000Z",
     "customerName": "Example Customer",
     "customerPhone": "+380671234567",
     "customerEmail": "customer@example.invalid"
   }
   ```

   The `Idempotency-Key` must match `^[A-Za-z0-9][A-Za-z0-9_:-]{7,127}$`.
   Generate once **per booking intent** and retain across network retries; generate a new key when any submitted booking field changes. The email, when supplied, must match the authenticated account. Do not include price, duration, customer ID, role or status.

   The response is `201 { "id": 123, "replayed": false }` for a new booking and
   `200 { "id": 123, "replayed": true }` for an idempotent retry.

## Error handling in the wizard

| HTTP | Meaning | Frontend action |
| --- | --- | --- |
| 400 | Invalid query/body or expired booking window | Show field validation and refresh selections |
| 401 / 403 | Authentication or account contact mismatch | Ask to sign in / correct contact |
| 404 | Barber/service is unavailable | Refresh the catalog and services |
| 409 | Slot taken or idempotency token conflicts | Refresh availability; generate a new token **only for a changed intent** |
| 413 | Booking JSON exceeds 8192 UTF-8 bytes | Limit request payload |
| 415 | Expected `application/json` | Fix client content type |
| 429 | Rate limit reached | Respect `Retry-After` where present |
| 503 | Booking writes unavailable or limiter outage | Show unavailable state; **do not claim the booking succeeded** |

**Deployment restriction:** booking mutation routes intentionally return 503 in production until the controlled rollout. A wizard can display real read-only availability but must not imply that submission is enabled.

After success, authenticated customers can read `GET /api/bookings/mine?filter=upcoming`.
The final booking is still subject to PostgreSQL overlap enforcement; an availability slot is an invitation to book, **not a reservation**.

## Implementation notes

- The selected services, barber, shop and time are a single booking intent.
- Preserve service IDs in selection order; do not send duplicate IDs.
- When the user changes any service, discard previously loaded slots and reload availability for the new combination.
- Avoid separate availability calls for each service: independent free slots do not prove that the combined visit fits.
- A guest contact form does not grant booking write permission; the current POST endpoint requires an authenticated account. Guest booking requires a separately approved backend workflow.
