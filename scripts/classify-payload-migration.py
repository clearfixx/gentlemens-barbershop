#!/usr/bin/env python3
"""Classify Payload-generated migrations without executing them.

Payload's first migration is a full schema bootstrap even when an existing
database has already been initialized by schema push. Never apply such a
migration directly to a populated installation.
"""
from pathlib import Path
import re
import sys

migration_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "src/migrations")
files = sorted(migration_dir.glob("*.ts"))
files = [path for path in files if path.name != "index.ts"]
if not files:
    raise SystemExit("No generated Payload migration candidate found")

for path in files:
    source = path.read_text(encoding="utf-8")
    up = source.split("export async function down", 1)[0]
    created = set(re.findall(r'CREATE TABLE\s+"([^"]+)"', up, re.I))
    dropped = set(re.findall(r'DROP TABLE\s+"([^"]+)"', up, re.I))
    legacy = {"users", "services", "locations", "barbers", "bookings"}
    if created & legacy:
        print(f"WARNING: {path.name}: FULL SCHEMA BOOTSTRAP, NOT AN INCREMENTAL UPGRADE")
        print("Existing tables recreated: " + ", ".join(sorted(created & legacy)))
        print("Do not run this migration against an existing installation.")
    elif dropped & legacy:
        raise SystemExit(f"UNSAFE: {path.name} drops existing core tables")
    else:
        print(f"{path.name}: no core table creation/drop detected; manual SQL review still required")
