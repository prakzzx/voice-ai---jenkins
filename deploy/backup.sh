#!/usr/bin/env bash
# Dumps the database to /opt/prakati/backups and keeps the newest 7 files.
# Run by hand or from cron, e.g.:  0 3 * * * /home/ubuntu/prakati/deploy/backup.sh
set -euo pipefail
DIR=/opt/prakati/backups
mkdir -p "$DIR"
docker exec prakati-db pg_dump -U prakati prakati | gzip > "$DIR/prakati-$(date +%F-%H%M).sql.gz"
ls -1t "$DIR"/prakati-*.sql.gz | tail -n +8 | xargs -r rm --
echo "Backup written to $DIR"
