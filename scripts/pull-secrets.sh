#!/bin/bash
# Baja los secretos del entorno de desarrollo local desde Doppler. Una vez por computadora:
#   1) instalar la CLI de Doppler y correr `doppler login`
#   2) bash scripts/pull-secrets.sh
# Uso: bash scripts/pull-secrets.sh [config]    (por defecto dev_local; otros: dev, prod)
set -e
cd "$(dirname "$0")/.."
CONFIG=${1:-dev_local}
command -v doppler > /dev/null || { echo "Instalá la CLI de Doppler: https://docs.doppler.com/docs/install-cli"; exit 1; }
doppler secrets download --no-file --format env --project junquero --config "$CONFIG" > backend/.dev.vars
chmod 600 backend/.dev.vars
echo "backend/.dev.vars actualizado desde Doppler (junquero/$CONFIG)"
