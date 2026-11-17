import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/** Append-only decisions about supporting evidence. NOT a publication
 * authorization and NOT a store for sensitive customer consent documents.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_portfolio_evidence_review_outcome" AS ENUM (
      'needs_evidence', 'evidence_reviewed', 'rejected'
    );
    CREATE TABLE "portfolio_media_evidence_events" (
      "id" bigserial PRIMARY KEY NOT NULL,
      "revision_id" integer NOT NULL,
      "media_id" integer NOT NULL,
      "reviewer_id" integer NOT NULL,
      "submitted_manifest_hash" varchar(64) NOT NULL,
      "rights_reference" varchar(256),
      "consent_reference" varchar(256),
      "outcome" "enum_portfolio_evidence_review_outcome" NOT NULL,
      "reviewer_note" varchar(1000) NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "portfolio_evidence_hash" CHECK (
        submitted_manifest_hash ~ '^[0-9a-f]{64}$'
      ),
      CONSTRAINT "portfolio_evidence_note" CHECK (
        char_length(btrim(reviewer_note)) BETWEEN 1 AND 1000
      ),
      CONSTRAINT "portfolio_evidence_references" CHECK (
        outcome <> 'evidence_reviewed' OR
        (rights_reference IS NOT NULL AND consent_reference IS NOT NULL)
      )
    );
    ALTER TABLE "portfolio_media_evidence_events"
      ADD CONSTRAINT "portfolio_evidence_revision_fk"
        FOREIGN KEY ("revision_id") REFERENCES "public"."barber_profile_revisions"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
      ADD CONSTRAINT "portfolio_evidence_media_fk"
        FOREIGN KEY ("media_id") REFERENCES "public"."private_barber_portfolio_media"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
      ADD CONSTRAINT "portfolio_evidence_reviewer_fk"
        FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION;
    CREATE INDEX "portfolio_evidence_media_latest_idx"
      ON "portfolio_media_evidence_events" USING btree ("revision_id", "media_id", "id" DESC);
    CREATE INDEX "portfolio_evidence_reviewer_idx"
      ON "portfolio_media_evidence_events" USING btree ("reviewer_id");

    CREATE FUNCTION public.deny_portfolio_evidence_mutation()
      RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'Portfolio evidence history is append-only';
    END;
    $$;
    CREATE TRIGGER portfolio_evidence_immutable
      BEFORE UPDATE OR DELETE ON public.portfolio_media_evidence_events
      FOR EACH ROW EXECUTE FUNCTION public.deny_portfolio_evidence_mutation();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM public.portfolio_media_evidence_events) THEN
        RAISE EXCEPTION 'Cannot discard portfolio evidence decision history';
      END IF;
    END $$;
    DROP TABLE "portfolio_media_evidence_events";
    DROP FUNCTION "public"."deny_portfolio_evidence_mutation"();
    DROP TYPE "public"."enum_portfolio_evidence_review_outcome";
  `)
}
