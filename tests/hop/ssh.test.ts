import { describe, it, expect } from 'vitest';
import { composeSshHopExec } from '../../src/hop/ssh';

describe('SSH hop exec composer', () => {
  it('emits a single exec directive with ssh + StrictHostKeyChecking=accept-new', () => {
    const d = composeSshHopExec({
      credsPath: '/home/u/.ssh/kvm2_ed25519',
      targetUser: 'aj',
      targetHost: 'kvm2',
      bundleB64: 'AAAA',
    });
    expect(d.op).toBe('exec');
    expect(d.cmd).toMatch(/ssh /);
    expect(d.cmd).toMatch(/StrictHostKeyChecking=accept-new/);
    expect(d.cmd).toMatch(/ConnectTimeout=10/);
    expect(d.cmd).toMatch(/BatchMode=yes/);
    expect(d.cmd).toContain('aj@kvm2');
    // The bundleB64 ('AAAA') is no longer literally in the outer cmd because
    // the entire remote bootstrap is base64-wrapped to survive 3-layer shell
    // parsing. Instead, decode the inner base64 and verify the original
    // bundleB64 appears in the bootstrap script.
    const innerB64 = d.cmd.match(/echo (\S+) \| base64 -d \| bash/)?.[1];
    expect(innerB64).toBeDefined();
    const bootstrap = atob(innerB64!);
    expect(bootstrap).toContain('AAAA');
    expect(bootstrap).toContain('mktemp -d');
    expect(d.timeout_s).toBeGreaterThanOrEqual(60);
  });

  it('rejects creds path with shell metacharacters', () => {
    expect(() => composeSshHopExec({
      credsPath: '/tmp/k; rm -rf /',
      targetUser: 'aj', targetHost: 'kvm2', bundleB64: 'AAAA',
    })).toThrow();
  });

  it('rejects target user with backticks', () => {
    expect(() => composeSshHopExec({
      credsPath: '/k', targetUser: 'aj`whoami`', targetHost: 'kvm2', bundleB64: 'A',
    })).toThrow();
  });
});
