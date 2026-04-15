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
    expect(d.cmd).toContain('AAAA');
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
