#!/usr/bin/env python3
"""Regression checks for the Payload generated migration import normalizer."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

NORMALIZER = Path(__file__).with_name("normalize-generated-payload-migration.py")


class MigrationImportNormalizerTests(unittest.TestCase):
    def run_normalizer(self, content):
        with tempfile.TemporaryDirectory() as folder:
            migration = Path(folder) / "20261109_test.ts"
            migration.write_text(content, encoding="utf-8")
            result = subprocess.run([sys.executable, str(NORMALIZER), folder], capture_output=True, text=True)
            return result, migration.read_text(encoding="utf-8")

    def test_single_quote_import(self):
        source = "import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'\n"
        result, content = self.run_normalizer(source)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("import type { MigrateDownArgs, MigrateUpArgs }", content)

    def test_double_quote_reversed_order(self):
        source = 'import { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres"\n'
        result, content = self.run_normalizer(source)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("import type { MigrateUpArgs, MigrateDownArgs }", content)

    def test_real_generated_mixed_import_preserves_sql(self):
        source = "import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'\\n"
        result, content = self.run_normalizer(source)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("import type { MigrateUpArgs, MigrateDownArgs }", content)
        self.assertIn("import { sql }", content)

    def test_unknown_import_fails_without_writing(self):
        source = "import { sql } from '@payloadcms/db-postgres'\n"
        result, content = self.run_normalizer(source)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(content, source)


if __name__ == "__main__":
    unittest.main()
