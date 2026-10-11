#!/usr/bin/env bash
# Applies every migration to a throwaway PostgreSQL and runs the behaviour tests.
# Usage: scripts/test-db.sh     (needs PostgreSQL 15+ server binaries on PATH or in /usr/lib/postgresql)
set -euo pipefail
cd "$(dirname "$0")/.."

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
trap 'pg_ctl -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT

initdb -D "$DATA" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -l "$DATA/log" start >/dev/null
PSQL=(psql -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "applying $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
for t in supabase/tests/behaviour*.sql; do
  OUT="$("${PSQL[@]}" -f "$t" 2>&1)" || { echo "$OUT"; echo "database tests: FAILED in $(basename "$t")"; exit 1; }
  echo "$OUT" | grep -E "NOTICE" | sed 's/.*NOTICE: */  /'
done
echo "database tests: OK"
