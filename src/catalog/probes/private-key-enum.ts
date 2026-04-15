import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
ls -la "$HOME/.ssh" 2>/dev/null | awk '{print $9}' | grep -E '^(id_|.*\\.pem$|.*_ed25519$|.*_rsa$)' || true
for f in "$HOME"/.ssh/*; do
  [ -f "$f" ] || continue
  case "$(head -c 30 "$f" 2>/dev/null)" in
    *PRIVATE*KEY*) echo "PRIVKEY:$f" ;;
  esac
done
`;

export const privateKeyEnum: ProbeManifest = {
  id: 'private-key-enum',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { keys: { type: 'array' } } },
  llrContributions: [
    { pattern: 'key_filename_matches_target', targetHypothesis: 'h:target-credentials', llr: 5.0 },
    { pattern: 'key_paired_with_known_host', targetHypothesis: 'h:target-credentials', llr: 3.0 },
  ],
  extractors: [
    // PRIVKEY:/path/to/key emitted by the body when a private-key blob is found.
    { pattern: 'key_filename_matches_target', regex: '^PRIVKEY:(\\S+)\\s*$', hypothesis: 'h:target-credentials' },
    // Bare `id_*` / `*_ed25519` / `*_rsa` filenames from `ls -la` parsing.
    { pattern: 'key_paired_with_known_host', regex: '^(id_\\S+|\\S+_ed25519|\\S+_rsa)\\s*$', hypothesis: 'h:target-credentials' },
  ],
  eigPrior: 0.6,
  wallClockEstimateS: 1,
  tokenCostEstimate: 200,
  fallbackProbeIds: ['shell-history-grep'],
};
