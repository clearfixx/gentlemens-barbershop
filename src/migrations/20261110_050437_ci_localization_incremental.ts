import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('uk', 'en');
  CREATE TYPE "public"."enum_translations_locale" AS ENUM('uk', 'en');
  CREATE TYPE "public"."enum_translations_status" AS ENUM('draft', 'published');
  CREATE TABLE "locations_locales" (
  	"localized_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "services_locales" (
  	"localized_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "barbers_locales" (
  	"localized_bio" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "translations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"locale" "enum_translations_locale" NOT NULL,
  	"status" "enum_translations_status" DEFAULT 'draft' NOT NULL,
  	"entries" jsonb DEFAULT '{}'::jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "translations_id" integer;
  ALTER TABLE "locations_locales" ADD CONSTRAINT "locations_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "services_locales" ADD CONSTRAINT "services_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "barbers_locales" ADD CONSTRAINT "barbers_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."barbers"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "locations_locales_locale_parent_id_unique" ON "locations_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "locations_locales_parent_id_idx" ON "locations_locales" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "services_locales_locale_parent_id_unique" ON "services_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "services_locales_parent_id_idx" ON "services_locales" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "barbers_locales_locale_parent_id_unique" ON "barbers_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "barbers_locales_parent_id_idx" ON "barbers_locales" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "translations_locale_idx" ON "translations" USING btree ("locale");
  CREATE INDEX "translations_updated_at_idx" ON "translations" USING btree ("updated_at");
  CREATE INDEX "translations_created_at_idx" ON "translations" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_translations_fk" FOREIGN KEY ("translations_id") REFERENCES "public"."translations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_translations_id_idx" ON "payload_locked_documents_rels" USING btree ("translations_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "locations_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "services_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "barbers_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "translations" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "locations_locales" CASCADE;
  DROP TABLE "services_locales" CASCADE;
  DROP TABLE "barbers_locales" CASCADE;
  DROP TABLE "translations" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_translations_fk";
  
  DROP INDEX "payload_locked_documents_rels_translations_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "translations_id";
  DROP TYPE "public"."_locales";
  DROP TYPE "public"."enum_translations_locale";
  DROP TYPE "public"."enum_translations_status";`)
}
