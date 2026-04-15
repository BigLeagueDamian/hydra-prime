import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
[ -f "$HOME/.ssh/config" ] && cat "$HOME/.ssh/config" 2>/dev/null || true
[ -f /etc/ssh/ssh_config ] && cat /etc/ssh/ssh_config 2>/dev/null || true
`;

export const sshConfigScan: ProbeManifest = {
  id: 'ssh-config-scan',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { raw: { type: 'string' } } },
  llrContributions: [
    { pattern: 'host_entry_matches_target_name', targetHypothesis: 'h:target-address', llr: 4.0 },
    { pattern: 'host_entry_with_identityfile', targetHypothesis: 'h:target-credentials', llr: 2.5 },
    { pattern: 'no_config_file', targetHypothesis: 'h:target-address', llr: -0.3 },
  ],
  extractors: [
    // Match `Host kvm2` style entries; capture the hostname.
    { pattern: 'host_entry_matches_target_name', regex: '^Host\\s+(\\S+)\\s*$', hypothesis: 'h:target-address', filterAllowlist: true },
    // Match `IdentityFile ~/.ssh/kvm2_ed25519` lines; capture the keyfile path.
    { pattern: 'host_entry_with_identityfile', regex: '^\\s*IdentityFile\\s+(\\S+)\\s*$', hypothesis: 'h:target-credentials' },
  ],
  eigPrior: 0.7,
  wallClockEstimateS: 1,
  tokenCostEstimate: 200,
  fallbackProbeIds: ['known-hosts-enum'],
};
