#!/usr/bin/env python3
"""Compare actual legacy PostgreSQL columns with a versioned bootstrap schema.

A strict table/column/type comparison is necessary but not sufficient for
authorizing baseline registration: constraints, indexes, enum labels and
database-specific customizations still require separate review.
"""
from pathlib import Path
import re
import sys

from compare_localization_schemas import parse_schema


def columns_with_definitions(path: str) -> dict[str, dict[str, str]]:
    text = Path(path).read_text(encoding="utf-8")
    result: dict[str, dict[str, str]] = {}
    table = None
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("CREATE TABLE ") and line.endswith("("):
            table = line.removeprefix("CREATE TABLE ").removesuffix("(").strip().rsplit(".", 1)[-1].strip('"')
            if table in result:
                raise ValueError(f"Duplicate table: {table}")
            result[table] = {}
        elif table is not None and line == ");":
            table = None
        elif table is not None and raw.startswith("    ") and line:
            if line.startswith(("CONSTRAINT ", "PRIMARY KEY ", "UNIQUE ", "CHECK ", "FOREIGN KEY ")):
                continue
            match = re.match(r'^("[^"]+"|[a-zA-Z_][a-zA-Z_0-9]*)\s+(.+?),?$', line)
            if not match:
                raise ValueError(f"Cannot parse column: {line}")
            column = match.group(1).strip('"')
            definition = re.sub(r"\s+", " ", match.group(2).removesuffix(",")).strip()
            result[table][column] = definition
    if table is not None or not result:
        raise ValueError("Empty or unterminated schema")
    return result


def compare_schemas(before: dict[str, dict[str, str]], after: dict[str, dict[str, str]]) -> list[str]:
    errors = []
    for table in sorted(before.keys() | after.keys()):
        if table not in before or table not in after:
            errors.append(f"Table mismatch: {table}")
            continue
        for column in sorted(before[table].keys() | after[table].keys()):
            if column not in before[table] or column not in after[table]:
                errors.append(f"Column mismatch: {table}.{column}")
            elif before[table][column] != after[table][column]:
                errors.append(f"Definition mismatch: {table}.{column}: {before[table][column]!r} != {after[table][column]!r}")
    return errors


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: verify-historical-baseline.py historical.sql bootstrap.sql", file=sys.stderr)
        return 2
    before = columns_with_definitions(sys.argv[1])
    after = columns_with_definitions(sys.argv[2])
    errors = compare_schemas(before, after)
    if errors:
        print("Historical schema does not match generated baseline:\n" + "\n".join(errors), file=sys.stderr)
        return 1
    print(f"PASS: {len(before)} tables with matching column definitions (not a full schema equivalence proof)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
