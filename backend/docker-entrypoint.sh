#!/bin/sh
set -e
echo "[entrypoint] applying database migrations (prisma migrate deploy)"
npx prisma migrate deploy
echo "[entrypoint] starting API"
exec node server.js
