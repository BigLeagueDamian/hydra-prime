import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
find "$HOME" -maxdepth 5 -name 'docker-compose*.y*ml' 2>/dev/null | head -50 | while read -r f; do
  echo "FILE:$f"
  cat "$f" 2>/dev/null | head -200
  echo "---"
done
`;

export const dockerComposeScan: ProbeManifest = {
  id: 'docker-compose-scan',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { services: { type: 'array' } } },
  llrContributions: [
    { pattern: 'service_name_matches_target', targetHypothesis: 'h:target-address', llr: 3.0 },
    { pattern: 'service_hostname_alias_matches', targetHypothesis: 'h:target-address', llr: 4.0 },
  ],
  eigPrior: 0.3,
  wallClockEstimateS: 4,
  tokenCostEstimate: 400,
  fallbackProbeIds: ['git-config-scan'],
};
