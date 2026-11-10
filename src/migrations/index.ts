import * as migration_20261110_050350 from './20261110_050350';
import * as migration_20261110_050437_ci_localization_incremental from './20261110_050437_ci_localization_incremental';

import * as migration_20261110_110000_booking_integrity from './20261110_110000_booking_integrity';

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
    up: migration_20261110_110000_booking_integrity.up,
    down: migration_20261110_110000_booking_integrity.down,
    name: '20261110_110000_booking_integrity',
  },
];
