import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/** Append-only precautionary holds. They are NOT verified legal consent
 * withdrawals; a claim's authenticity must be established separately.
 * No PII, attachments, or external URLs are stored here.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_portfolio_media_hold_kind" AS ENUM (
      'consent_concern', 'rights_concern', 'safety_concern'
    );
    CREATE TABLE "portfolio_media_precautionary_holds" (
      "id" bigserial PRIMARY KEY NOT NULL,
      "revision_id" integer NOT NULL,
      "media_id" integer NOT NULL,
      "actor_id" integer NOT NULL,
      "kind" "enum_portfolio_media_hold_kind" NOT NULL,
      "case_reference" varchar(256) NOT NULL,
      "reason" varchar(1000) NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "portfolio_hold_reason" CHECK (
        char_length(btrim(reason)) BETWEEN 5 AND 1000
      ),
      CONSTRAINT "portfolio_hold_reference" CHECK (
        char_length(btrim(case_reference)) BETWEEN 4 AND 256
      ),
      CONSTRAINT "portfolio_hold_revision_fk" FOREIGN KEY ("revision_id")
        REFERENCES "public"."barber_profile_revisions"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
      CONSTRAINT "portfolio_hold_media_fk" FOREIGN KEY ("media_id")
        REFERENCES "public"."private_barber_portfolio_media"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
      CONSTRAINT "portfolio_hold_actor_fk" FOREIGN KEY ("actor_id")
        REFERENCES "public"."users"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
      CONSTRAINT "portfolio_hold_one_per_media" UNIQUE ("media_id")
    );
    CREATE INDEX "portfolio_hold_revision_idx"
      ON "portfolio_media_precautionary_holds" USING btree ("revision_id");
    CREATE TRIGGER portfolio_hold_immutable
      BEFORE UPDATE OR DELETE ON public.portfolio_media_precautionary_holds
      FOR EACH ROW EXECUTE FUNCTION public.deny_portfolio_evidence_mutation();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM public.portfolio_media_precautionary_holds) THEN
        RAISE EXCEPTION 'Cannot discard portfolio media hold history';
      END IF;
    END $$;
    DROP TABLE "portfolio_media_precautionary_holds";
    DROP TYPE "public"."enum_portfolio_media_hold_kind";
  `)
}
