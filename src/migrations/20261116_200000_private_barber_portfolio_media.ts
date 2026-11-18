import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/** Private image bytes are never stored in publicly readable Payload Media.
 * Rollback is intentionally blocked when custody records exist.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "private_barber_portfolio_media" (
      "id" serial PRIMARY KEY NOT NULL,
      "revision_id" integer NOT NULL,
      "barber_id" integer NOT NULL,
      "location_id" integer NOT NULL,
      "uploaded_by_id" integer NOT NULL,
      "mime_type" varchar(24) NOT NULL,
      "size_bytes" integer NOT NULL,
      "sha256" varchar(64) NOT NULL,
      "content" bytea NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "private_portfolio_media_mime" CHECK (
        mime_type IN ('image/jpeg', 'image/png', 'image/webp')
      ),
      CONSTRAINT "private_portfolio_media_size" CHECK (
        size_bytes >= 1 AND size_bytes <= 5242880 AND
        octet_length(content) = size_bytes
      ),
      CONSTRAINT "private_portfolio_media_sha" CHECK (
        sha256 ~ '^[0-9a-f]{64}$'
      )
    );
    ALTER TABLE "private_barber_portfolio_media"
      ADD CONSTRAINT "private_portfolio_media_revision_fk"
        FOREIGN KEY ("revision_id") REFERENCES "public"."barber_profile_revisions"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
      ADD CONSTRAINT "private_portfolio_media_barber_fk"
        FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
      ADD CONSTRAINT "private_portfolio_media_location_fk"
        FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
      ADD CONSTRAINT "private_portfolio_media_uploader_fk"
        FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION;
    CREATE INDEX "private_portfolio_media_revision_idx"
      ON "private_barber_portfolio_media" USING btree ("revision_id");
    CREATE INDEX "private_portfolio_media_barber_idx"
      ON "private_barber_portfolio_media" USING btree ("barber_id");
    CREATE INDEX "private_portfolio_media_location_idx"
      ON "private_barber_portfolio_media" USING btree ("location_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM private_barber_portfolio_media) THEN
        RAISE EXCEPTION 'Cannot remove private portfolio media custody records';
      END IF;
    END $$;
    DROP TABLE "private_barber_portfolio_media";
  `)
}
