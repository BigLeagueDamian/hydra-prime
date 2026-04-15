import { describe, it, expect } from 'vitest';
import { composeBootstrapBundle, decodeBootstrapBundle } from '../../src/hop/bundle';

describe('bootstrap bundle', () => {
  it('round-trips script + token + packet', () => {
    const bundle = composeBootstrapBundle({
      hydra_sh: '#!/bin/bash\necho hi',
      masked_token_hex: 'ab'.repeat(32),
      salt: 'salt',
      mission_id: 'm_target_1',
      warm_packet: { foo: 'bar' },
      supervisor_url: 'https://w.workers.dev',
    });
    expect(typeof bundle).toBe('string');
    expect(bundle.length).toBeLessThan(2_000_000);
    const decoded = decodeBootstrapBundle(bundle);
    expect(decoded.mission_id).toBe('m_target_1');
    expect((decoded.warm_packet as any).foo).toBe('bar');
    expect(decoded.hydra_sh).toContain('echo hi');
  });

  it('produces a single-line base64 payload safe for SSH stdin', () => {
    const bundle = composeBootstrapBundle({
      hydra_sh: '#!/bin/bash', masked_token_hex: 'aa', salt: 's',
      mission_id: 'm', warm_packet: {}, supervisor_url: 'u',
    });
    expect(bundle).not.toContain('\n');
    expect(bundle).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});
