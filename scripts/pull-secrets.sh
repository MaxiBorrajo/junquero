#!/bin/bash
# Baja los secretos desde Doppler. Una vez por computadora:
#   1) instalar la CLI de Doppler y correr `doppler login`
#   2) bash scripts/pull-secrets.sh
# Uso: bash scripts/pull-secrets.sh [config]    (por defecto dev_local; otros: dev, prd)
# Las claves de los contratos van a contracts/.env y el resto a backend/.dev.vars.
set -e
cd "$(dirname "$0")/.."
CONFIG=${1:-dev_local}
command -v doppler > /dev/null || { echo "Instalá la CLI de Doppler: https://docs.doppler.com/docs/install-cli"; exit 1; }
ALL=$(doppler secrets download --no-file --format env --project junquero --config "$CONFIG" | grep -v "^DOPPLER_")
CONTRACT_KEYS='^(SEPOLIA_RPC_URL|ARBITRUM_RPC_URL|DEPLOYER_ADDRESS|FINAL_ADMIN|DEMO|DEPLOY_TEST_TOKEN|GOVERNANCE|ETHERSCAN_API_KEY|USDC|USDT|PERMIT2|DEPLOYMENT)='
echo "$ALL" | grep -E "$CONTRACT_KEYS" > contracts/.env || true
echo "$ALL" | grep -vE "$CONTRACT_KEYS" > backend/.dev.vars
chmod 600 backend/.dev.vars contracts/.env
echo "Listo desde Doppler (junquero/$CONFIG): backend/.dev.vars y contracts/.env"
