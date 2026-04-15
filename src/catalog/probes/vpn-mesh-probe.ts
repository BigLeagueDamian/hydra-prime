import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
command -v tailscale >/dev/null && tailscale status --json 2>/dev/null || true
command -v wg >/dev/null && wg show 2>/dev/null || true
command -v nmcli >/dev/null && nmcli con show --active 2>/dev/null || true
`;

export const vpnMeshProbe: ProbeManifest = {
  id: 'vpn-mesh-probe',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { peers: { type: 'array' } } },
  llrContributions: [
    { pattern: 'tailscale_peer_matches_target', targetHypothesis: 'h:target-address', llr: 6.0 },
    { pattern: 'wireguard_endpoint_matches_target', targetHypothesis: 'h:target-address', llr: 5.0 },
  ],
  eigPrior: 0.45,
  wallClockEstimateS: 3,
  tokenCostEstimate: 250,
  fallbackProbeIds: ['docker-compose-scan'],
};
