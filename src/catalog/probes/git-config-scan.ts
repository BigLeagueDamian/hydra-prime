import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
cat "$HOME/.gitconfig" 2>/dev/null || true
find "$HOME" -maxdepth 4 -name 'config' -path '*.git/config' 2>/dev/null | head -50 | while read -r f; do
  grep -E '(url|remote|host)' "$f" 2>/dev/null || true
done
`;

export const gitConfigScan: ProbeManifest = {
  id: 'git-config-scan',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { remotes: { type: 'array' } } },
  llrContributions: [
    { pattern: 'remote_url_contains_target', targetHypothesis: 'h:target-address', llr: 3.5 },
  ],
  eigPrior: 0.25,
  wallClockEstimateS: 3,
  tokenCostEstimate: 250,
  fallbackProbeIds: [],
};
