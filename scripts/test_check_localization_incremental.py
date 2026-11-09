"""Regression tests for fail-closed localization migration SQL classification."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

CHECKER = Path(__file__).with_name("check-localization-incremental.py")
TABLES = ("locations_locales", "services_locales", "barbers_locales", "translations")


class LocalizationMigrationSafetyTests(unittest.TestCase):
    def check(self, extra_sql: str):
        with tempfile.TemporaryDirectory() as tmp:
            migration = Path(tmp) / "20261109_000000_ci_localization_incremental.ts"
            creates = "\n".join(f'CREATE TABLE "{table}" ("id" integer);' for table in TABLES)
            migration.write_text(
                "export async function up() { await db.execute(sql\x60"
                + creates + "\n" + extra_sql
                + "\x60) }\nexport async function down() {}\n",
                encoding="utf-8",
            )
            return subprocess.run(
                [sys.executable, str(CHECKER), tmp],
                capture_output=True,
                text=True,
                check=False,
            )

    def test_expected_additive_schema_passes(self):
        self.assertEqual(self.check(
            'ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "translations_id" integer;'
        ).returncode, 0)

    def test_foreign_key_delete_action_is_not_destructive_statement(self):
        result = self.check(
            'ALTER TABLE "locations_locales" ADD CONSTRAINT "parent_fk" '
            'FOREIGN KEY ("id") REFERENCES "locations"("id") '
            'ON DELETE cascade ON UPDATE no action;'
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

    def test_rejects_drop_table(self):
        self.assertNotEqual(self.check('DROP TABLE "bookings";').returncode, 0)

    def test_rejects_delete_statement(self):
        self.assertNotEqual(self.check('DELETE FROM "bookings";').returncode, 0)

    def test_rejects_update_statement(self):
        self.assertNotEqual(self.check('UPDATE "bookings" SET "id" = 1;').returncode, 0)

    def test_rejects_unrelated_table_change(self):
        self.assertNotEqual(self.check(
            'ALTER TABLE "bookings" ADD COLUMN "danger" integer;'
        ).returncode, 0)

    def test_rejects_missing_expected_table(self):
        self.assertNotEqual(self.check(
            'DROP TABLE "translations";'
        ).returncode, 0)


if __name__ == "__main__":
    unittest.main()
