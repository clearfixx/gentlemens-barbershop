#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).with_name("classify-payload-migration.py")
spec = importlib.util.spec_from_file_location("migration_classifier", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MigrationClassifierTests(unittest.TestCase):
    def test_first_migration_is_bootstrap(self):
        self.assertEqual(module.classify('export async function up() { CREATE TABLE "bookings" (id integer); }')[0], "bootstrap")

    def test_schema_qualified_and_if_exists_drop_is_blocked(self):
        self.assertEqual(module.classify('DROP TABLE IF EXISTS "public"."users" CASCADE;')[0], "unsafe-drop")

    def test_incremental_addition_is_candidate(self):
        self.assertEqual(module.classify('ALTER TABLE "services" ADD COLUMN "label" varchar;')[0], "incremental-candidate")

    def test_destructive_column_change_needs_review(self):
        self.assertEqual(module.classify('ALTER TABLE "services" DROP COLUMN "name";')[0], "manual-review")

    def test_down_rollback_is_not_treated_as_forward_migration(self):
        sql = 'export async function up() { CREATE TABLE "translations" (id integer); }\\nexport async function down() { DROP TABLE "users"; }'
        self.assertEqual(module.classify(sql)[0], "incremental-candidate")


if __name__ == "__main__":
    unittest.main()
