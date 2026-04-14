import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
cat /etc/hosts 2>/dev/null || true
[ -d /etc/hosts.d ] && for f in /etc/hosts.d/*; do [ -f "$f" ] && cat "$f"; done || true
`;

export const hostsFile: ProbeManifest = {
  id: 'hosts-file',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { entries: { type: 'array' } } },
  llrContributions: [
    { pattern: 'target_name_in_hosts', targetHypothesis: 'h:target-address', llr: 6.0 },
  ],
  eigPrior: 0.4,
  wallClockEstimateS: 1,
  tokenCostEstimate: 100,
  fallbackProbeIds: ['cloud-cli-enum'],
};
