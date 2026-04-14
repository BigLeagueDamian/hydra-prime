import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
[ -f "$HOME/.ssh/known_hosts" ] && awk '{print $1}' "$HOME/.ssh/known_hosts" | tr ',' '\\n' | sort -u || true
`;

export const knownHostsEnum: ProbeManifest = {
  id: 'known-hosts-enum',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { hosts: { type: 'array' } } },
  llrContributions: [
    { pattern: 'target_name_present', targetHypothesis: 'h:target-address', llr: 3.5 },
    { pattern: 'target_ip_present', targetHypothesis: 'h:target-address', llr: 4.5 },
  ],
  eigPrior: 0.5,
  wallClockEstimateS: 1,
  tokenCostEstimate: 150,
  fallbackProbeIds: ['hosts-file'],
};
