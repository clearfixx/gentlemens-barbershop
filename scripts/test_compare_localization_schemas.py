"""Negative regression tests for the read-only schema comparison gate."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).with_name("compare-localization-schemas.py")
spec = importlib.util.spec_from_file_location("schema_compare", MODULE)
assert spec and spec.loader
compare_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compare_module)


class SchemaComparisonTests(unittest.TestCase):
    def test_parser_extracts_pg_dump_columns(self):
        sql = (
            "CREATE TABLE public.services (\n"
            "    id integer NOT NULL,\n"
            "    name character varying NOT NULL,\n"
            "    description text,\n"
            "    CONSTRAINT services_pkey PRIMARY KEY (id)\n"
            ");\n"
        )
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "schema.sql"
            path.write_text(sql, encoding="utf-8")
            self.assertEqual(compare_module.parse_schema(str(path)), {
                "services": {"id", "name", "description"}
            })

    def test_missing_legacy_table_fails(self):
        self.assertIn("Dropped legacy table: bookings",
                      compare_module.compare({"bookings": {"id"}}, {}))

    def test_missing_legacy_column_fails(self):
        errors = compare_module.compare({"services": {"id", "description"}},
                                        {"services": {"id"}})
        self.assertIn("Dropped legacy column: services.description", errors)

    def test_missing_localized_storage_fails(self):
        errors = compare_module.compare({}, {})
        self.assertIn("Missing localized table: services_locales", errors)
        self.assertIn("Missing localized table: translations", errors)

    def test_missing_localized_column_fails(self):
        after = {key: set(value) for key, value in compare_module.EXPECTED.items()}
        after["barbers_locales"].remove("localized_bio")
        errors = compare_module.compare({}, after)
        self.assertIn("Missing localized column: barbers_locales.localized_bio", errors)

    def test_additive_schema_passes(self):
        before = {"services": {"id", "name"}}
        after = {**{key: set(value) for key, value in compare_module.EXPECTED.items()},
                 "services": {"id", "name", "localized_copy"}}
        self.assertEqual(compare_module.compare(before, after), [])


if __name__ == "__main__":
    unittest.main()
