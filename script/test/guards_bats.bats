#!/usr/bin/env bats

load '../lib/guards.sh'

@test "hydra_assert_no_listen passes when no listen sockets opened by us" {
  run hydra_assert_no_listen
  [ "$status" -eq 0 ]
}

@test "hydra_refuse_sudo blocks sudo invocation" {
  run hydra_check_cmd 'sudo ls'
  [ "$status" -ne 0 ]
}

@test "hydra_refuse_sudo allows non-sudo invocation" {
  run hydra_check_cmd 'echo hi'
  [ "$status" -eq 0 ]
}

@test "hydra_refuse_write_outside blocks write outside HYDRA_HOME" {
  export HYDRA_HOME=/tmp/h_$$
  mkdir -p "$HYDRA_HOME"
  run hydra_assert_path_in_home '/etc/passwd' 'write'
  [ "$status" -ne 0 ]
  run hydra_assert_path_in_home "$HYDRA_HOME/file" 'write'
  [ "$status" -eq 0 ]
}
