import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/** Investigation events complement permanent precautionary holds; case closure
 * can NEVER lift the hold, reinstate a candidate or authorize publication.
 * No client documents, claimant contacts, PII, or external URLs are stored.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_portfolio_hold_case_stage" AS ENUM (
      'investigating', 'awaiting_information', 'escalated', 'closed_administratively'
    );
    CREATE TABLE "portfolio_hold_case_events" (
      "id" bigserial PRIMARY KEY NOT NULL,
      "hold_id" bigint NOT NULL,
      "actor_id" integer NOT NULL,
      "assigned_admin_id" integer NOT NULL,
      "stage" "enum_portfolio_hold_case_stage" NOT NULL,
      "note" varchar(1000) NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "portfolio_hold_case_note" CHECK (
        char_length(btrim(note)) BETWEEN 5 AND 1000
      ),
      CONSTRAINT "portfolio_hold_case_hold_fk" FOREIGN KEY ("hold_id")
        REFERENCES "public"."portfolio_media_precautionary_holds"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
      CONSTRAINT "portfolio_hold_case_actor_fk" FOREIGN KEY ("actor_id")
        REFERENCES "public"."users"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
      CONSTRAINT "portfolio_hold_case_assignee_fk" FOREIGN KEY ("assigned_admin_id")
        REFERENCES "public"."users"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    );
    CREATE INDEX "portfolio_hold_case_latest_idx"
      ON "portfolio_hold_case_events" USING btree ("hold_id", "id" DESC);
    CREATE INDEX "portfolio_hold_case_assignee_idx"
      ON "portfolio_hold_case_events" USING btree ("assigned_admin_id", "id" DESC);
    CREATE TRIGGER portfolio_hold_case_events_immutable
      BEFORE UPDATE OR DELETE ON public.portfolio_hold_case_events
      FOR EACH ROW EXECUTE FUNCTION public.deny_portfolio_evidence_mutation();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM public.portfolio_hold_case_events) THEN
        RAISE EXCEPTION 'Cannot discard portfolio hold investigation history';
      END IF;
    END $$;
    DROP TABLE "portfolio_hold_case_events";
    DROP TYPE "public"."enum_portfolio_hold_case_stage";
  `)
}
