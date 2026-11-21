#!/bin/bash
# Crea jurados de demo extra en Sepolia (por defecto jurado6 a jurado10) para poder sortear los 7 que pide una apelación de 3 jurados.
# Para cada uno: keystore de Foundry nuevo, ETH para gas (sale de `admin`), credencial nivel 0 y jurado semilla (firma `admin`),
# USDC de prueba y garantía de 10 USDC depositada en el Arbitration.
# Uso: bash scripts/add-jurors.sh [desde] [hasta]     (ej.: bash scripts/add-jurors.sh 6 10)
# Pide dos contraseñas: la del keystore `admin` y una nueva para los keystores de los jurados. Nada se guarda en el repositorio.
set -euo pipefail
cd "$(dirname "$0")/../contracts"
set -a; source .env; set +a
FROM=${1:-6}; TO=${2:-10}
KS=~/.foundry/keystores
D=deployments/sepolia.json
TOKEN=$(jq -r .contracts.token.address $D)
ARB=$(jq -r .contracts.arbitration.address $D)
CRED=$(jq -r .contracts.credentials.address $D)
STAKE=10000000   # 10 USDC (6 decimales)
GAS_ETH=0.0006ether

read -rsp "Contraseña del keystore admin: " ADMIN_PW; echo
read -rsp "Contraseña para los keystores de los jurados nuevos: " JUROR_PW; echo
TMP=$(mktemp -d); chmod 700 "$TMP"; trap 'rm -rf "$TMP"' EXIT
printf %s "$ADMIN_PW" > "$TMP/admin"; printf %s "$JUROR_PW" > "$TMP/juror"

send() { cast send --rpc-url "$SEPOLIA_RPC_URL" "$@" > /dev/null; }
ADMIN_ARGS=(--keystore "$KS/admin" --password-file "$TMP/admin")

for n in $(seq "$FROM" "$TO"); do
  NAME=jurado$n
  if [ ! -f "$KS/$NAME" ]; then
    CAST_PASSWORD="$JUROR_PW" cast wallet new "$KS" "$NAME" > /dev/null
  fi
  ADDR=$(cast wallet address --keystore "$KS/$NAME" --password-file "$TMP/juror")
  echo "== $NAME $ADDR"
  JARGS=(--keystore "$KS/$NAME" --password-file "$TMP/juror")

  BAL=$(cast balance "$ADDR" --rpc-url "$SEPOLIA_RPC_URL")
  [ "$BAL" = "0" ] && { echo "  ETH para gas"; send "${ADMIN_ARGS[@]}" "$ADDR" --value $GAS_ETH; }

  HAS=$(cast call "$CRED" "has(address)(bool)" "$ADDR" --rpc-url "$SEPOLIA_RPC_URL")
  [ "$HAS" = "false" ] && { echo "  credencial nivel 0"; send "${ADMIN_ARGS[@]}" "$CRED" "issue(address,uint8)" "$ADDR" 0; }

  echo "  jurado semilla"; send "${ADMIN_ARGS[@]}" "$ARB" "setSeedJuror(address,bool)" "$ADDR" true

  echo "  USDC de prueba"; send "${JARGS[@]}" "$TOKEN" "mint(address,uint256)" "$ADDR" 100000000
  echo "  garantía de 10 USDC"
  send "${JARGS[@]}" "$TOKEN" "approve(address,uint256)" "$ARB" "$STAKE"
  send "${JARGS[@]}" "$ARB" "stake(uint128)" "$STAKE"
done

echo "Listo. Para importar a MetaMask: cast wallet private-key --keystore $KS/jurado6   (te pide la contraseña)"
