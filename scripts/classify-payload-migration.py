#!/usr/bin/env python3
"""Read-only safety gate for generated Payload migrations.

This is intentionally conservative: a full bootstrap is useful as a CI
artifact but must never be mistaken for an incremental production migration.
"""
from pathlib import Path
import re
import sys

CORE = {"users", "services", "locations", "barbers", "bookings"}
CREATE = re.compile(r'\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"public"\.)?"([^"]+)"', re.I)
DROP = re.compile(r'\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"public"\.)?"([^"]+)"', re.I)
ALTER_DROP = re.compile(r'\bALTER\s+TABLE\s+(?:"public"\.)?"([^"]+)"[\s\S]*?\bDROP\s+COLUMN\b', re.I)


def classify(source: str) -> tuple[str, set[str]]:
    # Classify the forward migration only; down() is an intentional rollback.
    up = source.split("export async function down", 1)[0]
    created = set(CREATE.findall(up))
    dropped = set(DROP.findall(up))
    if dropped & CORE:
        return "unsafe-drop", dropped & CORE
    if created & CORE:
        return "bootstrap", created & CORE
    if ALTER_DROP.search(up):
        return "manual-review", set()
    return "incremental-candidate", set()


def main() -> int:
    migration_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "src/migrations")
    files = sorted(p for p in migration_dir.glob("*.ts") if p.name != "index.ts")
    if not files:
        print("ERROR: No generated Payload migration candidate found", file=sys.stderr)
        return 1
    blocked = False
    for path in files:
        kind, tables = classify(path.read_text(encoding="utf-8"))
        print(f"{path.name}: {kind}" + (f" ({', '.join(sorted(tables))})" if tables else ""))
        if kind in {"bootstrap", "unsafe-drop", "manual-review"}:
            blocked = True
    if blocked:
        print("BLOCKED for populated database deployment; generated files remain review-only.")
        return 2
    print("Candidate requires manual SQL review and rehearsal before deployment.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
