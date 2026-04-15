/**
 * Target-side proof-of-arrival script. Lightweight: reads the bundle, computes
 * its own fingerprint, signs a /v1/success POST with the supervisor-issued
 * session_key, and exits. v1 doesn't run a full poll loop on the target —
 * arrival proof IS the success criterion. v2 will ship the full lib code so
 * the target can probe + further hop.
 *
 * The string is plain bash. It will be embedded in bundle.json (hydra_sh
 * field) and extracted/executed by the SSH bootstrap on the target.
 */
export const TARGET_BOOTSTRAP_SH = `#!/usr/bin/env bash
set -eu
B="\${HYDRA_BUNDLE_PATH:-./bundle.json}"
MISSION_ID=$(python3 -c "import json;print(json.load(open('$B'))['mission_id'])")
SUPERVISOR=$(python3 -c "import json;print(json.load(open('$B'))['supervisor_url'])")
SESSION_KEY=$(python3 -c "import json;print(json.load(open('$B'))['session_key'])")
ORIGIN_ID=$(python3 -c "import json;print(json.load(open('$B'))['warm_packet']['jump_chain_origin'])")
HOST=$(hostname)
MID=$(cat /etc/machine-id 2>/dev/null || echo no-machine-uuid)
FP=$(printf '%s|||%s' "$HOST" "$MID" | openssl dgst -sha256 -hex | awk '{print $2}')
UNAME=$(uname -a)
BODY=$(printf '{"mission_id":"%s","target_fingerprint":"%s","target_evidence":{"hostname":"%s","uname":"%s"},"jump_chain":["%s","%s"]}' \\
  "$MISSION_ID" "$FP" "$HOST" "$UNAME" "$ORIGIN_ID" "$MISSION_ID")
TS=$(date +%s)
SIG=$(printf 'POST\\n/v1/success\\n%s\\n%s' "$BODY" "$TS" | openssl dgst -sha256 -hmac "$SESSION_KEY" -hex | awk '{print $2}')
curl -k -fsS -X POST "$SUPERVISOR/v1/success" \\
  -H "X-Hydra-Sig: $SIG" -H "X-Hydra-Ts: $TS" -H 'Content-Type: application/json' \\
  -d "$BODY" > /tmp/hydra-target-result.json 2>/tmp/hydra-target-err.log
echo "target-arrival-proof-submitted-mission=$MISSION_ID-fp=$FP" > /tmp/hydra-target-status
`;
