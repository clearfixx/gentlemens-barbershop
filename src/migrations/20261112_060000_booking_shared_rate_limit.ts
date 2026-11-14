import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * Shared fixed-window booking budget. This migration only creates storage;
 * production HTTP writes remain disabled until deployment controls are ready.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "booking_rate_limit_buckets" (
      "identity" text NOT NULL,
      "window_start" bigint NOT NULL,
      "hits" integer NOT NULL CHECK ("hits" > 0),
      CONSTRAINT "booking_rate_limit_buckets_pk" PRIMARY KEY ("identity", "window_start")
    );
    CREATE INDEX IF NOT EXISTS "booking_rate_limit_window_idx"
      ON "booking_rate_limit_buckets" ("window_start");

    CREATE OR REPLACE FUNCTION booking_rate_limit_consume(
      p_identity text, p_now_ms bigint, p_window_ms bigint, p_limit integer
    ) RETURNS boolean LANGUAGE plpgsql AS $function$
    DECLARE
      current_hits integer;
    BEGIN
      IF p_identity IS NULL OR length(p_identity) = 0 OR length(p_identity) > 200
         OR p_now_ms < 0 OR p_window_ms < 1000 OR p_limit < 1 THEN
        RAISE EXCEPTION 'Invalid limiter input';
      END IF;
      INSERT INTO booking_rate_limit_buckets(identity, window_start, hits)
      VALUES (p_identity, (p_now_ms / p_window_ms) * p_window_ms, 1)
      ON CONFLICT (identity, window_start)
      DO UPDATE SET hits = booking_rate_limit_buckets.hits + 1
        WHERE booking_rate_limit_buckets.hits < p_limit
      RETURNING hits INTO current_hits;
      RETURN current_hits IS NOT NULL;
    END $function$;

    CREATE OR REPLACE FUNCTION booking_rate_limit_prune(
      p_before_window_start bigint
    ) RETURNS bigint LANGUAGE plpgsql AS $function$
    DECLARE
      removed bigint;
    BEGIN
      IF p_before_window_start < 0 THEN
        RAISE EXCEPTION 'Invalid retention cutoff';
      END IF;
      DELETE FROM booking_rate_limit_buckets
      WHERE window_start < p_before_window_start;
      GET DIAGNOSTICS removed = ROW_COUNT;
      RETURN removed;
    END $function$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP FUNCTION IF EXISTS booking_rate_limit_prune(bigint);
    DROP FUNCTION IF EXISTS booking_rate_limit_consume(text, bigint, bigint, integer);
    DROP TABLE IF EXISTS booking_rate_limit_buckets;
  `)
}
