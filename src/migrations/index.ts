import * as migration_20261110_050350 from './20261110_050350';
import * as migration_20261110_050437_ci_localization_incremental from './20261110_050437_ci_localization_incremental';

import * as migration_20261111_120000_booking_cancellation_policy from './20261111_120000_booking_cancellation_policy';

import * as migration_20261111_121000_barber_account_binding from './20261111_121000_barber_account_binding';

import * as migration_20261111_122000_booking_events from './20261111_122000_booking_events';

import * as migration_20261111_123000_booking_fk_integrity from './20261111_123000_booking_fk_integrity';

import * as migration_20261112_060000_booking_shared_rate_limit from './20261112_060000_booking_shared_rate_limit';

import * as migration_20261113_150000_guest_cancellation_challenge from './20261113_150000_guest_cancellation_challenge';

export const migrations = [
  {
    up: migration_20261110_050350.up,
    down: migration_20261110_050350.down,
    name: '20261110_050350',
  },
  {
    up: migration_20261110_050437_ci_localization_incremental.up,
    down: migration_20261110_050437_ci_localization_incremental.down,
    name: '20261110_050437_ci_localization_incremental'
  },
  {
    up: migration_20261111_120000_booking_cancellation_policy.up,
    down: migration_20261111_120000_booking_cancellation_policy.down,
    name: '20261111_120000_booking_cancellation_policy',
  },
  {
    up: migration_20261111_121000_barber_account_binding.up,
    down: migration_20261111_121000_barber_account_binding.down,
    name: '20261111_121000_barber_account_binding',
  },
  {
    up: migration_20261111_122000_booking_events.up,
    down: migration_20261111_122000_booking_events.down,
    name: '20261111_122000_booking_events',
  },
  {
    up: migration_20261111_123000_booking_fk_integrity.up,
    down: migration_20261111_123000_booking_fk_integrity.down,
    name: '20261111_123000_booking_fk_integrity',
  },
  {
    up: migration_20261112_060000_booking_shared_rate_limit.up,
    down: migration_20261112_060000_booking_shared_rate_limit.down,
    name: '20261112_060000_booking_shared_rate_limit',
  },
  {
    up: migration_20261113_150000_guest_cancellation_challenge.up,
    down: migration_20261113_150000_guest_cancellation_challenge.down,
    name: '20261113_150000_guest_cancellation_challenge',
  },
];
