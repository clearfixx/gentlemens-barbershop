#!/usr/bin/env python3
"""Fix Payload 3.93.0's generated mixed value/type imports in ephemeral CI."""
from pathlib import Path
import re
import sys

folder = Path(sys.argv[1] if len(sys.argv) > 1 else "src/migrations")
files = sorted(p for p in folder.glob("*.ts") if p.name != "index.ts")
if not files:
    raise SystemExit("No migration candidate to normalize")

pattern = re.compile(r"^import\s*\{([^}\n]+)\}\s*from\s*(['\"])@payloadcms/db-postgres\2\s*$", re.M)
type_names = {"MigrateUpArgs", "MigrateDownArgs"}
for file in files:
    source = file.read_text(encoding="utf-8")
    def normalize(match):
        names = [part.strip() for part in match.group(1).split(",")]
        if len(names) != len(set(names)) or not type_names.issubset(names):
            raise ValueError("Unexpected migration import names")
        values = [name for name in names if name not in type_names]
        if any(name != "sql" for name in values):
            raise ValueError(f"Unexpected runtime import(s): {values}")
        quote = match.group(2)
        package = f"{quote}@payloadcms/db-postgres{quote}"
        result = f"import type {{ MigrateUpArgs, MigrateDownArgs }} from {package}"
        if values:
            result += f"\nimport {{ sql }} from {package}"
        return result

    try:
        updated, count = pattern.subn(normalize, source)
    except ValueError as exc:
        raise SystemExit(f"{file.name}: {exc}") from exc
    if count != 1:
        raise SystemExit(f"{file.name}: expected one known Payload migration import, got {count}")
    file.write_text(updated, encoding="utf-8")
    print(f"{file.name}: normalized type-only imports; preserved runtime sql")
