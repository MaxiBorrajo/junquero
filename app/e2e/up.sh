#!/bin/bash
# Levanta una cadena local (anvil), despliega los contratos y corre el servidor local sobre una copia del repo.
# Uso: bash e2e/up.sh   y despues:   npx vitest run --config vitest.e2e.config.ts
# Requiere Foundry (anvil, forge, cast) y acceso a internet una vez, para copiar Multicall3 desde Sepolia.
set -e
export PATH=$PATH:$HOME/.foundry/bin
REPO=$(cd "$(dirname "$0")/../.." && pwd)
ROOT=/tmp/junquero-e2e/repo
OUT_DIR=/tmp/junquero-e2e
KEY0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ADMIN_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
RELAYER_KEY=0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6

mkdir -p $OUT_DIR
kill $(lsof -ti tcp:8545) 2>/dev/null || true
kill $(lsof -ti tcp:8787) 2>/dev/null || true
sleep 2

if [ ! -d "$ROOT" ]; then
  git -C "$REPO" worktree add --detach "$ROOT" HEAD
  ln -s "$REPO/backend/node_modules" "$ROOT/backend/node_modules"
  ln -s "$REPO/app/node_modules" "$ROOT/app/node_modules"
  rm -rf "$ROOT/contracts/lib" && ln -s "$REPO/contracts/lib" "$ROOT/contracts/lib"
  mkdir -p "$ROOT/admin/dist" && echo "<html></html>" > "$ROOT/admin/dist/index.html"
fi
rm -rf "$ROOT/backend/.wrangler"
cp -r "$REPO/backend/src" "$ROOT/backend/" && cp -r "$REPO/backend/migrations" "$ROOT/backend/"
cp -r "$REPO/app/src" "$ROOT/app/" && cp -r "$REPO/app/e2e" "$ROOT/app/" && cp "$REPO/app/vitest.e2e.config.ts" "$ROOT/app/"

# La cadena arranca 3 dias en el pasado para poder avanzar el reloj sin pasarse de la hora real.
BACK=$(( $(date +%s) - 3*86400 ))
(anvil --chain-id 11155111 --block-time 1 --port 8545 --gas-limit 500000000 --code-size-limit 200000 --timestamp $BACK > $OUT_DIR/anvil.log 2>&1 &)
sleep 3
CODE=$(cast code 0xcA11bde05977b3631167028862bE2a173976CA11 --rpc-url https://ethereum-sepolia-rpc.publicnode.com)
cast rpc anvil_setCode 0xcA11bde05977b3631167028862bE2a173976CA11 "$CODE" --rpc-url http://127.0.0.1:8545 > /dev/null

cd "$ROOT/contracts"
OUT=$(DEPLOY_TEST_TOKEN=true DEMO=true forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key $KEY0 --slow --gas-limit 400000000 2>&1)
echo "$OUT" | grep -q "ONCHAIN EXECUTION COMPLETE" || { echo "$OUT" | tail -20; exit 1; }
python3 - "$OUT" "$REPO" "$ROOT" "$OUT_DIR" <<'PY'
import json,re,sys
out,repo,root,out_dir=sys.argv[1:5]
names={'token':'Token','forwarder':'Forwarder','parameterRegistry':'ParameterRegistry','treasury':'Treasury','escrow':'Escrow','credentials':'Credentials','reputation':'Reputation','receipt':'Receipt','arbitration':'Arbitration','votingWeight':'VotingWeight','timelock':'Timelock','governor':'Governor'}
new={k:re.search(r'^\s*'+v+r'\s+(0x[0-9a-fA-F]{40})',out,re.M).group(1) for k,v in names.items()}
d=json.load(open(repo+'/contracts/deployments/sepolia.json'))
for k,v in new.items(): d['contracts'][k]['address']=v
d['startBlock']=0
json.dump(d,open(root+'/contracts/deployments/sepolia.json','w'),indent=2)
json.dump(new,open(out_dir+'/local-addresses.json','w'),indent=2)
PY

cd "$ROOT/backend"
cp wrangler.jsonc wrangler.e2e.jsonc
sed -i -E 's/"limit": [0-9]+/"limit": 100000/g' wrangler.e2e.jsonc
printf 'RPC_URL=http://127.0.0.1:8545\nRELAYER_KEY=%s\nAUTH_SECRET=e2e-local-secret\n' "$RELAYER_KEY" > .dev.vars
npx wrangler d1 migrations apply junquero --local -c wrangler.e2e.jsonc > /dev/null 2>&1
(npx wrangler dev -c wrangler.e2e.jsonc --local --port 8787 --test-scheduled --var CONFIRMATIONS:0 --var BLOCK_CHUNK:500 --var CHUNKS_PER_RUN:20 --var ADMIN_ADDRESSES:$ADMIN_ADDRESS > $OUT_DIR/wrangler.log 2>&1 &)
for i in $(seq 1 30); do sleep 1; curl -s -m 3 http://127.0.0.1:8787/health | grep -q ok && break; done
curl -s http://127.0.0.1:8787/health; echo
echo "Listo. Corre las pruebas con:  cd $ROOT/app && npx vitest run --config vitest.e2e.config.ts"
