"""Historical baseline guard regression tests."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

MODULE_PATH = Path(__file__).with_name("verify-historical-baseline.py")
spec = importlib.util.spec_from_file_location("verify_historical_baseline", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class HistoricalBaselineTests(unittest.TestCase):
    def parse(self, schema):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "schema.sql"
            path.write_text(schema)
            return module.columns_with_definitions(str(path))

    def test_identical_schema(self):
        schema = 'CREATE TABLE public.services (\n    id integer NOT NULL,\n    name character varying NOT NULL\n);\n'
        parsed = self.parse(schema)
        self.assertEqual(module.compare_schemas(parsed, parsed), [])

    def test_missing_table(self):
        a = self.parse('CREATE TABLE public.services (\n    id integer NOT NULL\n);\n')
        b = self.parse('CREATE TABLE public.bookings (\n    id integer NOT NULL\n);\n')
        self.assertTrue(module.compare_schemas(a, b))

    def test_changed_type(self):
        a = self.parse('CREATE TABLE public.services (\n    id integer NOT NULL\n);\n')
        b = self.parse('CREATE TABLE public.services (\n    id bigint NOT NULL\n);\n')
        self.assertIn('Definition mismatch', module.compare_schemas(a, b)[0])

    def test_added_column(self):
        a = self.parse('CREATE TABLE public.services (\n    id integer NOT NULL\n);\n')
        b = self.parse('CREATE TABLE public.services (\n    id integer NOT NULL,\n    price numeric\n);\n')
        self.assertTrue(module.compare_schemas(a, b))

    def test_malformed_schema(self):
        with self.assertRaises(ValueError):
            self.parse('CREATE TABLE public.services (\n    id integer NOT NULL\n')


if __name__ == "__main__":
    unittest.main()
