#!/usr/bin/env bash
# Consistent copy of the SQLite database into ./backups (kept 14 days), and the car photos (only new ones
# are copied: their names never change). Optional off-site copy: add BACKUP_BUCKET=gs://your-bucket to .env
# Daily at 01:30 (crontab -e):
#   30 1 * * * /home/USER/octane/dealer/deploy/backup.sh >> /home/USER/octane/dealer/backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups/media

name="dealer-$(date +%Y-%m-%d-%H%M).db"
sudo docker compose exec -T app python -c "
import sqlite3
src = sqlite3.connect('/data/dealer.db')
dst = sqlite3.connect('/data/backup.db')
src.backup(dst)
dst.close(); src.close()
"
sudo docker compose cp app:/data/backup.db "backups/$name"
sudo docker compose exec -T app rm -f /data/backup.db
gzip -f "backups/$name"
find backups -name 'dealer-*.db.gz' -mtime +14 -delete

volume="$(basename "$PWD")_app_data"  # docker compose names volumes after the folder
media="$(sudo docker volume inspect -f '{{ .Mountpoint }}' "$volume")/media/"
sudo rsync -a "$media" backups/media/

bucket="$(grep -E '^BACKUP_BUCKET=' .env | cut -d= -f2- || true)"
if [ -n "$bucket" ]; then
  gcloud storage cp "backups/$name.gz" "$bucket/"
  gcloud storage rsync -r backups/media "$bucket/media"
fi
echo "$(date -Is) ok backups/$name.gz + media"
