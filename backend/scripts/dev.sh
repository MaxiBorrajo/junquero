#!/bin/bash
# Servidor local: base D1, R2 y chat simulados en backend/.wrangler, cron cada minuto y cadena Sepolia.
# Uso: cd backend && npm run dev      (necesita backend/.dev.vars, ver .dev.vars.example)
set -e
cd "$(dirname "$0")/.."
PORT=${PORT:-8787}

if [ ! -f .dev.vars ]; then
  echo "Falta backend/.dev.vars. Bajalo con: bash ../scripts/pull-secrets.sh  (o copiá .dev.vars.example y completalo)"
  exit 1
fi

npx wrangler d1 migrations apply junquero --local > /dev/null

# El cron real vive solo en Cloudflare; en local se dispara cada minuto contra el mismo servidor.
(
  until curl -s -m 2 "http://localhost:$PORT/health" > /dev/null; do sleep 2; done
  while true; do
    curl -s -m 60 "http://localhost:$PORT/__scheduled?cron=*+*+*+*+*" > /dev/null || true
    sleep 60
  done
) &
CRON_PID=$!
trap 'kill $CRON_PID 2>/dev/null' EXIT

npx wrangler dev --local --test-scheduled --port "$PORT" --ip 0.0.0.0
