#!/usr/bin/env python3
"""Compare pg_dump schema-only output without applying migrations.

Reject removed tables/columns; explicitly require localized tables and columns.
This is a structural safety gate, not a substitute for a migration rehearsal.
"""
import re
import sys
from pathlib import Path

CREATE_TABLE = re.compile(r'^CREATE TABLE (?:public\\.)?"?([a-z_][a-z_0-9]*)"? \\($', re.M)
COLUMN = re.compile(r'^    "?([a-z_][a-z_0-9]*)"? ([^,]+?)(?:,)?$', re.M)
EXPECTED = {
    'services_locales': {'_locale', '_parent_id', 'localized_description'},
    'locations_locales': {'_locale', '_parent_id', 'localized_description'},
    'barbers_locales': {'_locale', '_parent_id', 'localized_bio'},
    'translations': {'id'},
}


def parse_schema(path: str) -> dict[str, set[str]]:
    sql = Path(path).read_text(encoding='utf-8')
    result: dict[str, set[str]] = {}
    for match in CREATE_TABLE.finditer(sql):
        start = match.end()
        end = sql.find('\\n);', start)
        if end < 0:
            raise ValueError(f'Unterminated CREATE TABLE: {match.group(1)}')
        body = sql[start:end]
        columns = set(COLUMN.findall(body))
        # Only column names are needed; ignore constraints and SQL types.
        names = {name for name, _ in columns}
        if not names:
            raise ValueError(f'No columns parsed for {match.group(1)}')
        result[match.group(1)] = names
    if not result:
        raise ValueError(f'No PostgreSQL CREATE TABLE statements found in {path}')
    return result


def main() -> int:
    before = parse_schema(sys.argv[1])
    after = parse_schema(sys.argv[2])
    problems: list[str] = []
    for table, columns in before.items():
        if table not in after:
            problems.append(f'Dropped legacy table: {table}')
        else:
            for column in sorted(columns - after[table]):
                problems.append(f'Dropped legacy column: {table}.{column}')
    for table, columns in EXPECTED.items():
        if table not in after:
            problems.append(f'Missing localized table: {table}')
        else:
            for column in sorted(columns - after[table]):
                problems.append(f'Missing localized column: {table}.{column}')
    print(f'Baseline tables: {len(before)}; current tables: {len(after)}')
    print('Added tables:', ', '.join(sorted(after.keys() - before.keys())) or '(none)')
    if problems:
        print('Schema regression:\\n' + '\\n'.join(problems), file=sys.stderr)
        return 1
    print('PASS: no legacy tables or columns removed; required localized storage exists')
    return 0


if __name__ == '__main__':
    sys.exit(main())
