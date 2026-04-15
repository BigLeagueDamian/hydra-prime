import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
command -v aws >/dev/null && aws ec2 describe-instances --query 'Reservations[].Instances[].{n:Tags[?Key==\\\`Name\\\`]|[0].Value,ip:PublicIpAddress,priv:PrivateIpAddress}' --output json 2>/dev/null || true
command -v gcloud >/dev/null && gcloud compute instances list --format=json 2>/dev/null || true
command -v az >/dev/null && az vm list -d --output json 2>/dev/null || true
command -v doctl >/dev/null && doctl compute droplet list --output json 2>/dev/null || true
command -v hcloud >/dev/null && hcloud server list -o json 2>/dev/null || true
`;

export const cloudCliEnum: ProbeManifest = {
  id: 'cloud-cli-enum',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { instances: { type: 'array' } } },
  llrContributions: [
    { pattern: 'instance_name_matches_target', targetHypothesis: 'h:target-address', llr: 5.0 },
    { pattern: 'instance_tag_role_matches', targetHypothesis: 'h:target-address', llr: 3.0 },
  ],
  eigPrior: 0.6,
  wallClockEstimateS: 8,
  tokenCostEstimate: 600,
  fallbackProbeIds: ['k8s-context-enum'],
};
