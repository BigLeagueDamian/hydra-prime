import type { ExecDirective } from '../types';

export interface SshHopParams {
  credsPath: string;
  targetUser: string;
  targetHost: string;
  bundleB64: string;
}

const SAFE_PATH = /^[A-Za-z0-9_./-]+$/;
const SAFE_USER = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const SAFE_HOST = /^[A-Za-z0-9._-]+$/;
const SAFE_B64 = /^[A-Za-z0-9+/=]+$/;

export function composeSshHopExec(p: SshHopParams): ExecDirective {
  if (!SAFE_PATH.test(p.credsPath)) throw new Error(`unsafe credsPath: ${p.credsPath}`);
  if (!SAFE_USER.test(p.targetUser)) throw new Error(`unsafe targetUser: ${p.targetUser}`);
  if (!SAFE_HOST.test(p.targetHost)) throw new Error(`unsafe targetHost: ${p.targetHost}`);
  if (!SAFE_B64.test(p.bundleB64)) throw new Error('unsafe bundleB64');

  const remoteBootstrap = [
    `set -eu`,
    `tmp=$(mktemp -d)`,
    `cd "$tmp"`,
    `echo '${p.bundleB64}' | base64 -d > bundle.json`,
    `python3 -c "import json,sys,os; d=json.load(open('bundle.json')); open('h.sh','w').write(d['hydra_sh']); os.chmod('h.sh',0o755); print(d['mission_id'])" > mission.id`,
    `MISSION_ID=$(cat mission.id) HYDRA_BUNDLE_PATH="$tmp/bundle.json" ./h.sh </dev/null >/dev/null 2>&1 &`,
    `disown`,
  ].join(' && ');

  const cmd = `ssh -i ${p.credsPath} -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o BatchMode=yes ${p.targetUser}@${p.targetHost} ${JSON.stringify(remoteBootstrap)}`;

  return {
    id: `op_hop_${crypto.randomUUID().slice(0, 8)}`,
    op: 'exec',
    cmd,
    timeout_s: 60,
  };
}
