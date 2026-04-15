#!/usr/bin/env bash
set -euo pipefail

WORKER=""; KEY=""; ORIGIN=""; TARGET=""; TARGET_FP=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --worker) WORKER="$2"; shift 2 ;;
    --key) KEY="$2"; shift 2 ;;
    --origin) ORIGIN="$2"; shift 2 ;;
    --target) TARGET="$2"; shift 2 ;;
    --target-fingerprint) TARGET_FP="$2"; shift 2 ;;
    *) echo "unknown: $1"; exit 1 ;;
  esac
done

[[ -n "$WORKER" && -n "$KEY" && -n "$ORIGIN" && -n "$TARGET" ]] || { echo "missing arg"; exit 1; }

# 1. Compute origin fingerprint via SSH (script will recompute on host).
ORIGIN_FP=$(ssh -o BatchMode=yes "$ORIGIN" "hostname; ip -o link show 2>/dev/null | awk '/link\\/ether/ && \$2!~\"lo\" {print \$17;exit}'; cat /etc/machine-id 2>/dev/null" \
  | tr '\n' '|' | openssl dgst -sha256 -hex | awk '{print $2}')

# 2. Start mission.
RESP=$(curl -fsS -X POST "$WORKER/v1/admin/mission/start" \
  -H "X-Admin-Key: $KEY" -H "Content-Type: application/json" \
  -d "{\"fingerprint_expected\":\"$ORIGIN_FP\",\"target_allowlist\":[\"origin\",\"$TARGET\"],\"strict_gold\":true,\"budget_paid_usd\":10,\"deadline_seconds\":86400,\"platform\":\"linux\"}")
MISSION_ID=$(echo "$RESP" | python3 -c 'import json,sys;print(json.load(sys.stdin)["mission_id"])')
echo "started mission: $MISSION_ID"

# 3. Build hydra.sh.
bash script/build.sh

# 4. Generate masked token + salt for this mission.
TOKEN_HEX=$(openssl rand -hex 32)
SALT=$(openssl rand -hex 16)
MASK_HEX=$(printf '%s' "$ORIGIN_FP" | openssl dgst -sha256 -hmac "$SALT" -hex | awk '{print $2}')
MASKED_HEX=$(python3 -c "
t=bytes.fromhex('$TOKEN_HEX'); m=bytes.fromhex('$MASK_HEX')[:len(t)]
print(bytes(a^b for a,b in zip(t,m)).hex())
")

# 5. Substitute into hydra.sh.
sed -i.bak \
  -e "s|__SUPERVISOR_URL__|$WORKER|g" \
  -e "s|__MASKED_TOKEN_HEX__|$MASKED_HEX|g" \
  -e "s|__SALT__|$SALT|g" \
  -e "s|__MISSION_ID__|$MISSION_ID|g" \
  script/hydra.sh

# 6. Scp + launch on origin.
scp script/hydra.sh "$ORIGIN:/tmp/hydra-$MISSION_ID.sh"
ssh "$ORIGIN" "chmod +x /tmp/hydra-$MISSION_ID.sh && nohup /tmp/hydra-$MISSION_ID.sh </dev/null >/tmp/hydra-$MISSION_ID.log 2>&1 &"

echo "launched. watch: $WORKER/v1/admin/scoreboard (X-Admin-Key header)"
