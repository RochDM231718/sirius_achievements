#!/bin/sh
set -e

# Ensure upload directories exist inside the mounted volume
# and are writable by appuser (volume may have been created by root)
mkdir -p /app/static/uploads/achievements \
         /app/static/uploads/avatars \
         /app/static/uploads/support

chown -R appuser:appgroup /app/static/uploads /home/appuser

# Run database migrations as appuser before starting the app.
# Non-fatal: if migrations fail, the lifespan safety-net will still try
# to apply any missing columns (ALTER TABLE ... IF NOT EXISTS).
export HOME=/home/appuser
gosu appuser alembic upgrade head || echo "[entrypoint] alembic upgrade failed, continuing"

# Drop to appuser and run the main command
exec gosu appuser "$@"
