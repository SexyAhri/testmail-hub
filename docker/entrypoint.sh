#!/bin/sh
set -eu

APP_MODE="${APP_MODE:-dev}"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-4173}"
RUN_CHECKS_BEFORE_DEPLOY="${RUN_CHECKS_BEFORE_DEPLOY:-true}"

echo "[docker] app mode: ${APP_MODE}"

if [ "${APP_MODE}" = "deploy" ]; then
  if [ "${RUN_CHECKS_BEFORE_DEPLOY}" = "true" ]; then
    echo "[docker] running typecheck and tests before deploy..."
    npm run typecheck
    npm test
  fi

  echo "[docker] publishing to Cloudflare..."
  npm run deploy
  exit 0
fi

echo "[docker] applying local D1 migrations..."
npm run db:migrate:local

echo "[docker] starting app on ${HOST}:${PORT}..."
npm run dev -- --host "${HOST}" --port "${PORT}"
