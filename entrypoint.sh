#!/bin/sh
set -e

# Ensure upload directories exist inside the mounted volume
# and are writable by appuser (volume may have been created by root)
mkdir -p /app/static/uploads/achievements \
         /app/static/uploads/avatars \
         /app/static/uploads/support \
         /home/appuser/.EasyOCR

chown -R appuser:appgroup /app/static/uploads /app/easyocr_models /home/appuser

# Drop to appuser and run the main command
export HOME=/home/appuser
exec gosu appuser "$@"
