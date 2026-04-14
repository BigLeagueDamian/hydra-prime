#!/usr/bin/env bats

load '../lib/primitives.sh'

@test "hydra_exec_cmd captures stdout, exit, wall_ms" {
  result=$(hydra_exec_cmd 'echo hi' 5)
  echo "$result" | grep -q '"stdout":"hi'
  echo "$result" | grep -q '"exit_code":0'
  echo "$result" | grep -qE '"wall_ms":[0-9]+'
}

@test "hydra_exec_cmd reports nonzero exit" {
  result=$(hydra_exec_cmd 'exit 7' 5)
  echo "$result" | grep -q '"exit_code":7'
}

@test "hydra_read_file refuses path outside HYDRA_HOME when scoped" {
  export HYDRA_HOME=/tmp/testhome_$$
  mkdir -p "$HYDRA_HOME"
  echo hi > "$HYDRA_HOME/x"
  out=$(hydra_read_file "$HYDRA_HOME/x" 100 'home')
  echo "$out" | grep -q '"size":'
  err=$(hydra_read_file '/etc/passwd' 100 'home' || true)
  echo "$err" | grep -q '"err":"policy"'
}

@test "hydra_read_file truncates at max_bytes" {
  export HYDRA_HOME=/tmp/testhome2_$$
  mkdir -p "$HYDRA_HOME"
  head -c 1000 /dev/urandom > "$HYDRA_HOME/big"
  out=$(hydra_read_file "$HYDRA_HOME/big" 100 'home')
  echo "$out" | grep -q '"truncated":true'
}
