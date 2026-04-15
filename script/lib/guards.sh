#!/bin/bash
# script/lib/guards.sh
# Self-guards: deny sudo invocation, refuse paths outside HYDRA_HOME, no inbound listen sockets

hydra_check_cmd() {
  case "$1" in
    *sudo\ *|sudo) return 1 ;;
  esac
  return 0
}

hydra_assert_path_in_home() {
  case "$1" in
    "$HYDRA_HOME"/*) return 0 ;;
    *) return 1 ;;
  esac
}

hydra_assert_no_listen() {
  if command -v ss >/dev/null 2>&1; then
    if ss -tlnp 2>/dev/null | grep -q "pid=$$"; then return 1; fi
  fi
  return 0
}
