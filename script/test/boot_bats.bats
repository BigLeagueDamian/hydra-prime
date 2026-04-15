#!/usr/bin/env bats

load '../lib/boot.sh'

@test "hydra_fingerprint emits sha256 hex, 64 chars" {
  fp=$(hydra_fingerprint)
  [ "${#fp}" -eq 64 ]
  echo "$fp" | grep -qE '^[0-9a-f]{64}$'
}

@test "hydra_machine_uuid prefers /etc/machine-id when present" {
  if [ "$EUID" -ne 0 ]; then
    skip "needs root to write /etc/machine-id"
  fi
  echo "deadbeefcafe1234567890abcdef00112233445566778899aabbccddeeff0011" > /etc/machine-id
  uuid=$(hydra_machine_uuid)
  [ "$uuid" = "deadbeefcafe1234567890abcdef00112233445566778899aabbccddeeff0011" ]
}

@test "hydra_init_home creates HYDRA_HOME with 0700 perms" {
  export HOME=/tmp/test_home_$$
  mkdir -p "$HOME"
  hydra_init_home 'm_test'
  [ -d "$HOME/.hydra/m_test" ]
  perms=$(stat -c '%a' "$HOME/.hydra/m_test")
  [ "$perms" = "700" ]
}
