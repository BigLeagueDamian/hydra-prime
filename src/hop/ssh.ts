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

  // The remote bootstrap script. Newline-separated lines (clearer than &&-chain
  // and avoids re-tokenization issues when the directive crosses three shell
  // parsers: outer `bash -c` on origin, ssh's quoting, target shell).
  const remoteBootstrap = [
    `#!/bin/bash`,
    `set -eu`,
    `tmp=$(mktemp -d)`,
    `cd "$tmp"`,
    `echo '${p.bundleB64}' | base64 -d > bundle.json`,
    `python3 -c "import json,os; d=json.load(open('bundle.json')); open('h.sh','w').write(d['hydra_sh']); os.chmod('h.sh',0o755); print(d['mission_id'])" > mission.id`,
    `MISSION_ID=$(cat mission.id) HYDRA_BUNDLE_PATH="$tmp/bundle.json" nohup ./h.sh </dev/null >/tmp/hydra-hop.log 2>&1 &`,
    `disown`,
    `echo "hop-bootstrap-ok mission=$(cat mission.id)"`,
  ].join('\n');

  // Base64-wrap the entire bootstrap so it crosses every parser layer
  // unmodified. The remote ssh argument becomes a single safe single-quoted
  // string with no metacharacters that any parser will interpret.
  const bootstrapB64 = base64Encode(remoteBootstrap);

  // Single-quoted to prevent the OUTER `bash -c` (running on origin) from
  // expanding $() / $vars / && before ssh sees them. Inside single quotes the
  // string is literal; we just need to make sure bootstrapB64 contains no
  // single-quotes (base64 alphabet doesn't, by definition).
  const cmd = `ssh -i ${p.credsPath} -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o BatchMode=yes ${p.targetUser}@${p.targetHost} 'echo ${bootstrapB64} | base64 -d | bash'`;

  return {
    id: `op_hop_${crypto.randomUUID().slice(0, 8)}`,
    op: 'exec',
    cmd,
    timeout_s: 60,
  };
}

function base64Encode(s: string): string {
  // UTF-8-safe base64 in the Workers runtime (no Buffer).
  return btoa(unescape(encodeURIComponent(s)));
}
