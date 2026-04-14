#!/usr/bin/env bats

load '../lib/hmac.sh'

@test "hydra_hmac_hex matches openssl reference" {
  expected=$(printf 'GET\n/v1/poll\n\n1700000000' | openssl dgst -sha256 -hmac 'k_test' -hex | awk '{print $2}')
  actual=$(hydra_hmac_hex 'k_test' 'GET' '/v1/poll' '' '1700000000')
  [ "$actual" = "$expected" ]
}

@test "hydra_unmask_token recovers original on matching fingerprint" {
  local token_hex='0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20'
  local fp='sha256:abcdef'
  local salt='salt_xyz'
  local mask_hex
  mask_hex=$(printf '%s' "$fp" | openssl dgst -sha256 -hmac "$salt" -hex | awk '{print $2}')
  local masked_hex
  masked_hex=$(python3 -c "
import sys
t=bytes.fromhex('$token_hex'); m=bytes.fromhex('$mask_hex')[:len(t)]
sys.stdout.write(bytes(a^b for a,b in zip(t,m)).hex())
")
  recovered=$(hydra_unmask_token "$masked_hex" "$fp" "$salt")
  [ "$recovered" = "$token_hex" ]
}
