#!/bin/bash
# Database Backup Script for Medicore HMS

BACKUP_DIR="${BACKUP_DIR:-/backups/medicore}"
DATABASE_URL="$NEON_DATABASE_URL"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
LOG_FILE="${BACKUP_DIR}/backup.log"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Function to log messages
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Function to send alert
send_alert() {
    log "ALERT: $1"
    # Add alerting logic here (email, slack, etc.)
}

# Validate environment
if [ -z "$DATABASE_URL" ]; then
    send_alert "DATABASE_URL is not set"
    exit 1
fi

# Extract connection details
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|postgresql://([^:]+):.*@([^/]+)/.*|\2|')
DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|.*/([^?]+)(\?.*)?|\1|')

# Create backup filename
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${DATE}.sql"

log "Starting database backup for ${DB_NAME} to ${BACKUP_FILE}"

# Create backup using pg_dump if available, otherwise use neon's backup mechanism
if command -v pg_dump &> /dev/null; then
    PGPASSWORD=$(echo "$DATABASE_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
    export PGPASSWORD
    
    if pg_dump -h "$DB_HOST" -U "$(echo "$DATABASE_URL" | sed -E 's|postgresql://([^:]+):.*@.*|\1|')" \
        -d "$DB_NAME" -f "$BACKUP_FILE" --verbose; then
        log "Backup completed successfully: $BACKUP_FILE"
        
        # Compress backup
        gzip "$BACKUP_FILE"
        log "Backup compressed: ${BACKUP_FILE}.gz"
        
        # Clean up old backups
        find "$BACKUP_DIR" -name "*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete
        log "Old backups cleaned up (older than $RETENTION_DAYS days)"
    else
        send_alert "Database backup failed for ${DB_NAME}"
        exit 1
    fi
else
    log "pg_dump not available. Using Neon backup mechanism..."
    # Implement Neon-specific backup logic here
    # neon backup create --project-id $PROJECT_ID
fi

log "Backup process completed"