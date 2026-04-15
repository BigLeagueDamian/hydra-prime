# HMAC + XOR token helpers. POSIX-bash. No jq.

hydra_hmac_hex() {
  # $1=key  $2=method  $3=path  $4=body  $5=ts
  local msg
  msg=$(printf '%s\n%s\n%s\n%s' "$2" "$3" "$4" "$5")
  printf '%s' "$msg" | openssl dgst -sha256 -hmac "$1" -hex | awk '{print $2}'
}

hydra_unmask_token() {
  # $1=masked_hex  $2=fingerprint  $3=salt
  local masked_hex="$1" fp="$2" salt="$3" mask_hex
  mask_hex=$(printf '%s' "$fp" | openssl dgst -sha256 -hmac "$salt" -hex | awk '{print $2}')
  local need=${#masked_hex}
  mask_hex=${mask_hex:0:$need}
  local out='' i mb tb xor
  for ((i=0; i<need; i+=2)); do
    tb=$((16#${masked_hex:i:2}))
    mb=$((16#${mask_hex:i:2}))
    xor=$((tb ^ mb))
    out+=$(printf '%02x' "$xor")
  done
  printf '%s' "$out"
}
