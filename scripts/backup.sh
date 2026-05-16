#!/bin/bash
set -e

BACKUP_DIR=${BACKUP_DIR:-./backups}
DB_PATH=${DB_PATH:-./backend/data/plataforma.db}
RETENTION_DAYS=${RETENTION_DAYS:-30}
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

mkdir -p "$BACKUP_DIR"

echo "📀 Backing up database..."
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/plataforma_$TIMESTAMP.db'"
gzip "$BACKUP_DIR/plataforma_$TIMESTAMP.db"

echo "✅ Backup created: $BACKUP_DIR/plataforma_$TIMESTAMP.db.gz"

# Clean old backups
find "$BACKUP_DIR" -name "plataforma_*.db.gz" -mtime +$RETENTION_DAYS -delete
echo "🧹 Cleaned backups older than $RETENTION_DAYS days"
