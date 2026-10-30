#!/bin/sh
set -e

mkdir -p /data

echo "==> Prisma generate"
npx prisma generate

echo "==> Prisma migrate / db push"
npx prisma migrate deploy || true
npx prisma db push --accept-data-loss

echo "==> Starting app on port ${PORT:-11004}"
exec npx remix-serve ./build/server/index.js
