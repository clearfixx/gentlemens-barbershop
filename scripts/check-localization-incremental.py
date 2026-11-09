#!/usr/bin/env python3
"""Fail closed when a generated Payload localization migration exceeds its scope."""
from pathlib import Path
import re
import sys

directory = Path(sys.argv[1] if len(sys.argv) > 1 else "src/migrations")
candidates = sorted(directory.glob("*ci_localization_incremental.ts"))
if len(candidates) != 1:
    raise SystemExit(f"Expected one incremental migration, found {len(candidates)}")
source = candidates[0].read_text(encoding="utf-8")
up = source.split("export async function up(", 1)
if len(up) != 2 or "export async function down(" not in up[1]:
    raise SystemExit("Cannot isolate migration up()")
up_sql = up[1].split("export async function down(", 1)[0]
expected = {"locations_locales", "services_locales", "barbers_locales", "translations"}
created = set(re.findall(r'CREATE TABLE\s+"([^"]+)"', up_sql, flags=re.I))
if created != expected:
    raise SystemExit(f"Unexpected CREATE TABLE set: {sorted(created)}")
if re.search(r'\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b|\bALTER\s+TYPE\b', up_sql, flags=re.I):
    raise SystemExit("Destructive or data-mutating SQL detected in up()")
altered = set(re.findall(r'ALTER TABLE\s+"([^"]+)"', up_sql, flags=re.I))
if altered - (expected | {"payload_locked_documents_rels"}):
    raise SystemExit(f"Unexpected ALTER TABLE targets: {sorted(altered)}")
if re.search(r'ALTER TABLE\s+"[^"]+"\s+(?!ADD\b)', up_sql, flags=re.I):
    raise SystemExit("Only additive ALTER TABLE operations are permitted")
print("Incremental migration adds only expected localization tables and relations")
