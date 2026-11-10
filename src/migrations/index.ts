import * as migration_20261110_050350 from './20261110_050350';
import * as migration_20261110_050437_ci_localization_incremental from './20261110_050437_ci_localization_incremental';

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
];
