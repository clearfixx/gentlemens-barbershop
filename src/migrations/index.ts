import * as migration_20261110_050350 from './20261110_050350';
import * as migration_20261110_050437_ci_localization_incremental from './20261110_050437_ci_localization_incremental';

import * as migration_20261111_120000_booking_cancellation_policy from './20261111_120000_booking_cancellation_policy';

import * as migration_20261111_121000_barber_account_binding from './20261111_121000_barber_account_binding';

import * as migration_20261111_122000_booking_events from './20261111_122000_booking_events';

import * as migration_20261111_123000_booking_fk_integrity from './20261111_123000_booking_fk_integrity';

import * as migration_20261112_060000_booking_shared_rate_limit from './20261112_060000_booking_shared_rate_limit';

import * as migration_20261113_150000_booking_guest_cancellation_challenge from './20261113_150000_booking_guest_cancellation_challenge';

import * as migration_20261114_130000_customer_phone from './20261114_130000_customer_phone';

import * as migration_20261115_030000_customer_avatar from './20261115_030000_customer_avatar';

import * as migration_20261115_110000_verified_reviews from './20261115_110000_verified_reviews';

import * as migration_20261116_160000_admin_management_foundation from './20261116_160000_admin_management_foundation';

import * as migration_20261116_180000_location_booking_audit_role from './20261116_180000_location_booking_audit_role';

import * as migration_20261116_190000_barber_professional_revisions from './20261116_190000_barber_professional_revisions';

import * as migration_20261116_200000_private_barber_portfolio_media from './20261116_200000_private_barber_portfolio_media';

import * as migration_20261116_210000_submitted_portfolio_manifest from './20261116_210000_submitted_portfolio_manifest';

import * as migration_20261117_090000_portfolio_evidence_review from './20261117_090000_portfolio_evidence_review';

import * as migration_20261117_100000_portfolio_review_signoff from './20261117_100000_portfolio_review_signoff';

import * as migration_20261117_110000_private_portfolio_candidates from './20261117_110000_private_portfolio_candidates';

import * as migration_20261117_120000_portfolio_precautionary_holds from './20261117_120000_portfolio_precautionary_holds';

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
    up: migration_20261113_150000_booking_guest_cancellation_challenge.up,
    down: migration_20261113_150000_booking_guest_cancellation_challenge.down,
    name: '20261113_150000_booking_guest_cancellation_challenge',
  },
  {
    up: migration_20261114_130000_customer_phone.up,
    down: migration_20261114_130000_customer_phone.down,
    name: '20261114_130000_customer_phone',
  },
  {
    up: migration_20261115_030000_customer_avatar.up,
    down: migration_20261115_030000_customer_avatar.down,
    name: '20261115_030000_customer_avatar',
  },
  {
    up: migration_20261115_110000_verified_reviews.up,
    down: migration_20261115_110000_verified_reviews.down,
    name: '20261115_110000_verified_reviews',
  },
  {
    up: migration_20261116_160000_admin_management_foundation.up,
    down: migration_20261116_160000_admin_management_foundation.down,
    name: '20261116_160000_admin_management_foundation',
  },
  {
    up: migration_20261116_180000_location_booking_audit_role.up,
    down: migration_20261116_180000_location_booking_audit_role.down,
    name: '20261116_180000_location_booking_audit_role',
  },
  {
    up: migration_20261116_190000_barber_professional_revisions.up,
    down: migration_20261116_190000_barber_professional_revisions.down,
    name: '20261116_190000_barber_professional_revisions',
  },
  {
    up: migration_20261116_200000_private_barber_portfolio_media.up,
    down: migration_20261116_200000_private_barber_portfolio_media.down,
    name: '20261116_200000_private_barber_portfolio_media',
  },
  {
    up: migration_20261116_210000_submitted_portfolio_manifest.up,
    down: migration_20261116_210000_submitted_portfolio_manifest.down,
    name: '20261116_210000_submitted_portfolio_manifest',
  },
  {
    up: migration_20261117_090000_portfolio_evidence_review.up,
    down: migration_20261117_090000_portfolio_evidence_review.down,
    name: '20261117_090000_portfolio_evidence_review',
  },
  {
    up: migration_20261117_100000_portfolio_review_signoff.up,
    down: migration_20261117_100000_portfolio_review_signoff.down,
    name: '20261117_100000_portfolio_review_signoff',
  },
  {
    up: migration_20261117_110000_private_portfolio_candidates.up,
    down: migration_20261117_110000_private_portfolio_candidates.down,
    name: '20261117_110000_private_portfolio_candidates',
  },
  {
    up: migration_20261117_120000_portfolio_precautionary_holds.up,
    down: migration_20261117_120000_portfolio_precautionary_holds.down,
    name: '20261117_120000_portfolio_precautionary_holds',
  },
];
