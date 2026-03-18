#!/bin/sh
set -e

# Ensure upload directories exist inside the mounted volume
# and are writable by appuser (volume may have been created by root)
mkdir -p /app/static/uploads/achievements \
         /app/static/uploads/avatars \
         /app/static/uploads/support

chown -R appuser:appgroup /app/static/uploads

# Drop to appuser and run the main command
exec gosu appuser "$@"
