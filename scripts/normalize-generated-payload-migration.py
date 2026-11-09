#!/usr/bin/env python3
"""Normalize known Payload 3.93.0 generated type-only migration imports.

Only intended for ephemeral CI candidates; production migration files must
be reviewed and committed explicitly. Fails closed on unexpected import forms.
"""
from pathlib import Path
import re
import sys

folder = Path(sys.argv[1] if len(sys.argv) > 1 else "src/migrations")
files = [p for p in folder.glob("*.ts") if p.name != "index.ts"]
if not files:
    raise SystemExit("No migration candidate to normalize")
pattern = re.compile(r"import\s*\{\s*(MigrateDownArgs\s*,\s*MigrateUpArgs|MigrateUpArgs\s*,\s*MigrateDownArgs)\s*\}\s*from\s*(['\"])@payloadcms/db-postgres\3")
for file in files:
    source = file.read_text(encoding="utf-8")
    updated, count = pattern.subn(lambda match: "import type { " + match.group(1) + " } from " + match.group(3) + "@payloadcms/db-postgres" + match.group(3), source)
    if count != 1:
        raise SystemExit(f"{file.name}: expected one known Payload type import; got {count}")
    file.write_text(updated, encoding="utf-8")
    print(f"{file.name}: normalized Payload migration type imports")
