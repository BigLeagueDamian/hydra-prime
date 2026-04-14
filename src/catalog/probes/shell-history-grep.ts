import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
for f in "$HOME/.bash_history" "$HOME/.zsh_history" "$HOME/.local/share/fish/fish_history"; do
  [ -f "$f" ] && grep -E '^(ssh|scp|rsync|git@|sftp) ' "$f" 2>/dev/null | tail -200 || true
done
`;

export const shellHistoryGrep: ProbeManifest = {
  id: 'shell-history-grep',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { lines: { type: 'array' } } },
  llrContributions: [
    { pattern: 'ssh_invocation_to_target', targetHypothesis: 'h:target-address', llr: 5.5 },
    { pattern: 'ssh_invocation_with_keyfile', targetHypothesis: 'h:target-credentials', llr: 4.0 },
  ],
  eigPrior: 0.55,
  wallClockEstimateS: 1,
  tokenCostEstimate: 300,
  fallbackProbeIds: ['hosts-file'],
};
