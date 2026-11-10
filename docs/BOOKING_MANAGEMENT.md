# Booking management — approved policy and implementation plan

Status: in progress on `feat/booking-management`. Do not treat this document as proof that endpoints or migrations are deployed.

## Approved business rules

- New booking starts in `pending`; the slot is reserved immediately, including while awaiting manual approval.
- A barber assigned to the booking, or an administrator, may confirm or decline it.
- Customer cancellation is subject to the **current** cancellation deadline of the booking's location.
- Each location has an administrator-configurable deadline in whole minutes; default is **60**.
- Changing the deadline affects future cancellation attempts, including bookings created before the change.
- The server, not the browser, enforces the cutoff using absolute timestamps.
- Barber/admin cancellation is separately authorized and is not constrained by the customer self-service cutoff.
- Statuses: `pending`, `confirmed`, `completed`, `cancelled`, `no_show`.
- `completed`, `cancelled`, and `no_show` are terminal.
- No redesign of the booking UI in this phase.

## Implementation sequence

1. Pure cancellation policy and boundary tests.
2. Add the admin-editable location field with strict validation and a **reviewed Payload migration**; verify legacy locations default to 60.
3. Implement explicit status-transition authorization (customer, assigned barber, admin), concurrency-safe updates, and audit events.
4. Implement authenticated own-booking read and cancellation, barber management, and admin operations.
5. Verify HTTP authorization, PostgreSQL concurrency, release of cancelled slots, and all existing booking regression tests.

## Safety constraints

- Never enable production booking writes just to exercise the new endpoints. The existing production write guard remains fail-closed until shared rate limiting and production hardening are approved.
- No changes to the live database during development. Use the isolated PostgreSQL integration database.
- Do not trust client-provided status, price, policy, actor identity, or location.
- The current policy helper deliberately does not grant any user permission; callers must separately authorize the actor and validate the booking state.
