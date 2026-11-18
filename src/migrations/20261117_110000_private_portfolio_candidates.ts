import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/** Private publication candidate registry. Not public gallery storage.
 * All rows are always non-public by construction; new legal/policy-approved
 * publication requires a separate migration and feature/consent workflow.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_portfolio_candidate_status" AS ENUM ('prepared', 'withdrawn');
    CREATE TABLE "barber_portfolio_publication_candidates" (
      "id" bigserial PRIMARY KEY NOT NULL,
      "revision_id" integer NOT NULL,
      "media_id" integer NOT NULL,
      "barber_id" integer NOT NULL,
      "location_id" integer NOT NULL,
      "prepared_by_id" integer NOT NULL,
      "signoff_id" bigint NOT NULL,
      "manifest_sha256" varchar(64) NOT NULL,
      "media_sha256" varchar(64) NOT NULL,
      "alt_text" varchar(240) NOT NULL,
      "caption" varchar(1000),
      "sort_order" integer NOT NULL,
      "status" "enum_portfolio_candidate_status" DEFAULT 'prepared' NOT NULL,
      "public_enabled" boolean DEFAULT false NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "withdrawn_at" timestamp(3) with time zone,
      CONSTRAINT "portfolio_candidate_nonpublic" CHECK (public_enabled = false),
      CONSTRAINT "portfolio_candidate_hashes" CHECK (
        manifest_sha256 ~ '^[0-9a-f]{64}$' AND media_sha256 ~ '^[0-9a-f]{64}$'
      ),
      CONSTRAINT "portfolio_candidate_order" CHECK (sort_order BETWEEN 0 AND 1000),
      CONSTRAINT "portfolio_candidate_alt" CHECK (char_length(btrim(alt_text)) BETWEEN 3 AND 240),
      CONSTRAINT "portfolio_candidate_status_time" CHECK (
        (status = 'prepared' AND withdrawn_at IS NULL) OR
        (status = 'withdrawn' AND withdrawn_at IS NOT NULL)
      )
    );
    ALTER TABLE "barber_portfolio_publication_candidates"
      ADD CONSTRAINT "portfolio_candidate_revision_fk"
        FOREIGN KEY ("revision_id") REFERENCES "public"."barber_profile_revisions"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
      ADD CONSTRAINT "portfolio_candidate_media_fk"
        FOREIGN KEY ("media_id") REFERENCES "public"."private_barber_portfolio_media"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
      ADD CONSTRAINT "portfolio_candidate_barber_fk"
        FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
      ADD CONSTRAINT "portfolio_candidate_location_fk"
        FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
      ADD CONSTRAINT "portfolio_candidate_reviewer_fk"
        FOREIGN KEY ("prepared_by_id") REFERENCES "public"."users"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
      ADD CONSTRAINT "portfolio_candidate_signoff_fk"
        FOREIGN KEY ("signoff_id") REFERENCES "public"."portfolio_review_signoff_events"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION;
    CREATE UNIQUE INDEX "portfolio_candidate_revision_media_unique"
      ON "barber_portfolio_publication_candidates" USING btree ("revision_id", "media_id");
    CREATE INDEX "portfolio_candidate_status_idx"
      ON "barber_portfolio_publication_candidates" USING btree ("barber_id", "status");

    CREATE TABLE "barber_portfolio_candidate_events" (
      "id" bigserial PRIMARY KEY NOT NULL,
      "candidate_id" bigint NOT NULL,
      "actor_id" integer NOT NULL,
      "event" varchar(24) NOT NULL,
      "reason" varchar(1000) NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "portfolio_candidate_event_type" CHECK (event IN ('prepared','withdrawn')),
      CONSTRAINT "portfolio_candidate_event_reason" CHECK (
        char_length(btrim(reason)) BETWEEN 5 AND 1000
      )
    );
    ALTER TABLE "barber_portfolio_candidate_events"
      ADD CONSTRAINT "portfolio_candidate_event_parent_fk"
        FOREIGN KEY ("candidate_id") REFERENCES "public"."barber_portfolio_publication_candidates"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
      ADD CONSTRAINT "portfolio_candidate_event_actor_fk"
        FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION;
    CREATE INDEX "portfolio_candidate_event_idx"
      ON "barber_portfolio_candidate_events" USING btree ("candidate_id", "id" DESC);
    CREATE TRIGGER portfolio_candidate_event_immutable
      BEFORE UPDATE OR DELETE ON public.barber_portfolio_candidate_events
      FOR EACH ROW EXECUTE FUNCTION public.deny_portfolio_evidence_mutation();
    CREATE FUNCTION public.guard_portfolio_candidate_update()
      RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.id <> OLD.id OR NEW.revision_id <> OLD.revision_id OR
        NEW.media_id <> OLD.media_id OR NEW.barber_id <> OLD.barber_id OR
        NEW.location_id <> OLD.location_id OR NEW.prepared_by_id <> OLD.prepared_by_id OR
        NEW.signoff_id <> OLD.signoff_id OR
        NEW.manifest_sha256 <> OLD.manifest_sha256 OR
        NEW.media_sha256 <> OLD.media_sha256 OR
        NEW.alt_text <> OLD.alt_text OR
        NEW.caption IS DISTINCT FROM OLD.caption OR
        NEW.sort_order <> OLD.sort_order OR
        NEW.public_enabled <> OLD.public_enabled OR NEW.created_at <> OLD.created_at OR
        OLD.status <> 'prepared' OR NEW.status <> 'withdrawn' OR
        NEW.withdrawn_at IS NULL THEN
        RAISE EXCEPTION 'Portfolio candidate is immutable except withdrawal';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER portfolio_candidate_update_guard
      BEFORE UPDATE ON public.barber_portfolio_publication_candidates
      FOR EACH ROW EXECUTE FUNCTION public.guard_portfolio_candidate_update();
    CREATE TRIGGER portfolio_candidate_no_delete
      BEFORE DELETE ON public.barber_portfolio_publication_candidates
      FOR EACH ROW EXECUTE FUNCTION public.deny_portfolio_evidence_mutation();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM public.barber_portfolio_publication_candidates) OR
         EXISTS (SELECT 1 FROM public.barber_portfolio_candidate_events) THEN
        RAISE EXCEPTION 'Cannot remove portfolio publication candidates or audit history';
      END IF;
    END $$;
    DROP TABLE "barber_portfolio_candidate_events";
    DROP TABLE "barber_portfolio_publication_candidates";
    DROP FUNCTION public.guard_portfolio_candidate_update();
    DROP TYPE "public"."enum_portfolio_candidate_status";
  `)
}
