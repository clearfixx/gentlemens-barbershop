#!/usr/bin/env python3
"""Read-only schema inventory gate; not an in-place migration rehearsal."""
import sys
from pathlib import Path

EXPECTED = {
    "services_locales": {"_locale", "_parent_id", "localized_description"},
    "locations_locales": {"_locale", "_parent_id", "localized_description"},
    "barbers_locales": {"_locale", "_parent_id", "localized_bio"},
    "translations": {"id"},
}


def parse_schema(path: str) -> dict[str, set[str]]:
    tables: dict[str, set[str]] = {}
    current: str | None = None
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line.startswith("CREATE TABLE ") and line.endswith("("):
            qualified = line.removeprefix("CREATE TABLE ").removesuffix("(").strip()
            current = qualified.rsplit(".", 1)[-1].strip('"')
            if current in tables:
                raise ValueError(f"Duplicate CREATE TABLE: {current}")
            tables[current] = set()
        elif current is not None and line == ");":
            if not tables[current]:
                raise ValueError(f"No columns parsed for {current}")
            current = None
        elif current is not None and raw.startswith("    ") and line:
            if line.startswith(("CONSTRAINT ", "PRIMARY KEY ", "UNIQUE ", "CHECK ", "FOREIGN KEY ")):
                continue
            name = line.split(maxsplit=1)[0].strip('"')
            tables[current].add(name)
    if current is not None or not tables:
        raise ValueError(f"Malformed or empty PostgreSQL schema: {path}")
    return tables


def compare(before: dict[str, set[str]], after: dict[str, set[str]]) -> list[str]:
    errors = []
    for table, columns in before.items():
        if table not in after:
            errors.append(f"Dropped legacy table: {table}")
        else:
            errors.extend(f"Dropped legacy column: {table}.{column}" for column in sorted(columns - after[table]))
    for table, columns in EXPECTED.items():
        if table not in after:
            errors.append(f"Missing localized table: {table}")
        else:
            errors.extend(f"Missing localized column: {table}.{column}" for column in sorted(columns - after[table]))
    return errors


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: compare-localization-schemas.py baseline.sql current.sql", file=sys.stderr)
        return 2
    before, after = parse_schema(sys.argv[1]), parse_schema(sys.argv[2])
    print(f"Baseline tables: {len(before)}; current tables: {len(after)}")
    print("Added tables:", ", ".join(sorted(after.keys() - before.keys())) or "(none)")
    errors = compare(before, after)
    if errors:
        print("Schema regression:\n" + "\n".join(errors), file=sys.stderr)
        return 1
    print("PASS: no legacy tables or columns removed; required localized storage exists")
    return 0


if __name__ == "__main__":
    sys.exit(main())
