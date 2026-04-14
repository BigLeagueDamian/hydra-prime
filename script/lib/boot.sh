# Boot sequence: fingerprint, HYDRA_HOME, register handshake.

hydra_machine_uuid() {
  if [ -r /etc/machine-id ]; then
    cat /etc/machine-id
    return
  fi
  if command -v ioreg >/dev/null 2>&1; then
    ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null \
      | awk -F\" '/IOPlatformUUID/{print $4; exit}' && return
  fi
  if command -v lsblk >/dev/null 2>&1; then
    lsblk -ndo SERIAL 2>/dev/null | awk 'NF{print; exit}' && return
  fi
  echo "no-machine-uuid"
}

hydra_primary_mac() {
  if command -v ip >/dev/null 2>&1; then
    ip -o link show 2>/dev/null | awk '/link\/ether/ && !/00:00:00:00:00:00/ {print $17; exit}'
    return
  fi
  if command -v ifconfig >/dev/null 2>&1; then
    ifconfig 2>/dev/null | awk '/ether/ {print $2; exit}'
    return
  fi
  echo "00:00:00:00:00:00"
}

hydra_fingerprint() {
  local h m u
  h=$(hostname 2>/dev/null || echo unknown)
  m=$(hydra_primary_mac)
  u=$(hydra_machine_uuid)
  printf '%s|%s|%s' "$h" "$m" "$u" | openssl dgst -sha256 -hex | awk '{print $2}'
}

hydra_detect_platform() {
  case "$(uname -s)" in
    Linux*)
      if grep -qi microsoft /proc/version 2>/dev/null; then echo wsl; else echo linux; fi ;;
    Darwin*) echo macos ;;
    *) echo linux ;;
  esac
}

hydra_init_home() {
  # $1 = mission_id
  HYDRA_HOME="$HOME/.hydra/$1"
  mkdir -p "$HYDRA_HOME"
  chmod 700 "$HYDRA_HOME"
  export HYDRA_HOME
}
