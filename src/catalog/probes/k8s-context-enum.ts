import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
[ -f "$HOME/.kube/config" ] || exit 0
command -v kubectl >/dev/null || exit 0
kubectl config get-contexts -o name 2>/dev/null | while read -r ctx; do
  reach=$(kubectl --context="$ctx" auth can-i list nodes 2>/dev/null || echo "no")
  echo "$ctx:$reach"
done
`;

export const k8sContextEnum: ProbeManifest = {
  id: 'k8s-context-enum',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { contexts: { type: 'array' } } },
  llrContributions: [
    { pattern: 'context_name_matches_target', targetHypothesis: 'h:target-address', llr: 4.5 },
    { pattern: 'reachable_node_in_context', targetHypothesis: 'h:network-path', llr: 3.0 },
  ],
  eigPrior: 0.4,
  wallClockEstimateS: 5,
  tokenCostEstimate: 400,
  fallbackProbeIds: ['vpn-mesh-probe'],
};
