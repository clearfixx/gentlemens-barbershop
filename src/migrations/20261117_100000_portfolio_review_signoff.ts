import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/** Administrative signoff is independent from publication and never changes
 * the professional revision's state to approved or exposes any photo. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_portfolio_review_signoff_outcome" AS ENUM (
      'review_complete', 'returned_for_evidence'
    );
    CREATE TABLE "portfolio_review_signoff_events" (
      "id" bigserial PRIMARY KEY NOT NULL,
      "revision_id" integer NOT NULL,
      "reviewer_id" integer NOT NULL,
      "submitted_manifest_hash" varchar(64) NOT NULL,
      "outcome" "enum_portfolio_review_signoff_outcome" NOT NULL,
      "reviewer_note" varchar(1000) NOT NULL,
      "image_count" integer NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "portfolio_signoff_hash" CHECK (
        submitted_manifest_hash ~ '^[0-9a-f]{64}$'
      ),
      CONSTRAINT "portfolio_signoff_note" CHECK (
        char_length(btrim(reviewer_note)) BETWEEN 1 AND 1000
      ),
      CONSTRAINT "portfolio_signoff_count" CHECK (image_count BETWEEN 1 AND 30)
    );
    ALTER TABLE "portfolio_review_signoff_events"
      ADD CONSTRAINT "portfolio_signoff_revision_fk"
        FOREIGN KEY ("revision_id") REFERENCES "public"."barber_profile_revisions"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
      ADD CONSTRAINT "portfolio_signoff_reviewer_fk"
        FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION;
    CREATE INDEX "portfolio_signoff_latest_idx"
      ON "portfolio_review_signoff_events" USING btree ("revision_id", "id" DESC);
    CREATE TRIGGER portfolio_signoff_immutable
      BEFORE UPDATE OR DELETE ON public.portfolio_review_signoff_events
      FOR EACH ROW EXECUTE FUNCTION public.deny_portfolio_evidence_mutation();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM public.portfolio_review_signoff_events) THEN
        RAISE EXCEPTION 'Cannot discard portfolio review signoff history';
      END IF;
    END $$;
    DROP TABLE "portfolio_review_signoff_events";
    DROP TYPE "public"."enum_portfolio_review_signoff_outcome";
  `)
}
