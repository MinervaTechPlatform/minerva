#!/bin/sh
set -e

echo "[entrypoint] Downloading RDS global bundle to /app/global-bundle.pem"
curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o /app/global-bundle.pem
echo "[entrypoint] Downloaded RDS global bundle"

if [ -f /app/global-bundle.pem ]; then
  echo "[entrypoint] Verified /app/global-bundle.pem exists"
else
  echo "[entrypoint] Missing /app/global-bundle.pem"
  exit 1
fi

echo "[entrypoint] Running drizzle-kit push"
./migrate-tools/node_modules/.bin/drizzle-kit push --config=drizzle.config.ts
echo "[entrypoint] drizzle-kit push completed"

echo "[entrypoint] Running tenant schema migrations"
NODE_PATH=/app/migrate-tools/node_modules node /app/src/db/run-tenant-migrations.mjs
echo "[entrypoint] Tenant schema migrations completed"

echo "[entrypoint] Starting Next.js server"
exec env HOSTNAME=0.0.0.0 node server.js
