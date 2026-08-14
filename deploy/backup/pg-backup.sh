#!/usr/bin/env bash
# Nightly dump of every Finora database.
#
# Runs from the host and reaches into the postgres container, so it needs no client installed and
# survives the container being recreated. The password is read from the stack's .env at run time
# and is never stored in this file.
set -euo pipefail

STACK=/data/apps/metal-erp
OUT=/data/backups/postgres
LOG="$OUT/backup.log"
KEEP_DAYS=30
DATABASES="finora finora2"

mkdir -p "$OUT"
log() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG"; }

PGPW=$(grep '^POSTGRES_PASSWORD=' "$STACK/.env" | cut -d= -f2-)
if [ -z "$PGPW" ]; then
  log "FAIL could not read the postgres password from $STACK/.env"
  exit 1
fi

stamp=$(date -u +%Y%m%d-%H%M%S)
status=0

for DB in $DATABASES; do
  target="$OUT/$DB-$stamp.dump"

  # Written to .part first, then renamed. A dump interrupted half way through leaves a .part
  # behind rather than a plausible-looking .dump that would quietly become the newest backup.
  if ! docker exec -e PGPASSWORD="$PGPW" postgres \
        pg_dump -U postgres -Fc -d "$DB" > "$target.part" 2>>"$LOG"; then
    log "FAIL $DB  pg_dump returned non-zero"
    status=1
    continue
  fi
  mv "$target.part" "$target"

  # A dump that cannot be read back is not a backup. Listing its table of contents catches a
  # truncated or empty file tonight, instead of on the night it is actually needed.
  objects=$(docker exec -i -e PGPASSWORD="$PGPW" postgres pg_restore --list < "$target" 2>>"$LOG" \
            | grep -c '^[0-9]' || true)
  size=$(stat -c %s "$target")

  if [ "${objects:-0}" -gt 0 ] && [ "$size" -gt 1000 ]; then
    log "OK   $DB  ${size} bytes, ${objects} objects"
  else
    log "FAIL $DB  dump unreadable (size=${size} objects=${objects:-0})"
    status=1
  fi
done

pruned=$(find "$OUT" -name '*.dump' -mtime "+$KEEP_DAYS" -print -delete | wc -l)
if [ "$pruned" -gt 0 ]; then
  log "pruned ${pruned} dump(s) older than ${KEEP_DAYS} days"
fi

# Keep the log bounded without needing logrotate for a file that gains three lines a day.
if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 1000000 ]; then
  tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

exit $status
