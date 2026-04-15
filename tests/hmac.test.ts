import { describe, it, expect } from 'vitest';
import { signRequest, verifyRequest, maskToken, unmaskToken } from '../src/hmac';

describe('HMAC', () => {
  const key = 'k_test_session_key_aaaaaaaaaaaaaa';

  it('round-trips sign/verify', async () => {
    const now = Math.floor(Date.now() / 1000);
    const sig = await signRequest(key, 'POST', '/v1/report', '{"x":1}', now);
    const ok = await verifyRequest(key, 'POST', '/v1/report', '{"x":1}', now, sig, { now });
    expect(ok).toBe(true);
  });

  it('rejects tampered body', async () => {
    const now = Math.floor(Date.now() / 1000);
    const sig = await signRequest(key, 'POST', '/v1/report', '{"x":1}', now);
    const ok = await verifyRequest(key, 'POST', '/v1/report', '{"x":2}', now, sig, { now });
    expect(ok).toBe(false);
  });

  it('rejects timestamp drift > 60s', async () => {
    const now = Math.floor(Date.now() / 1000);
    const sig = await signRequest(key, 'GET', '/v1/poll', '', now - 120);
    const ok = await verifyRequest(key, 'GET', '/v1/poll', '', now - 120, sig, { now, windowS: 60 });
    expect(ok).toBe(false);
  });

  it('rejects timestamp drift > 60s in the future', async () => {
    const now = Math.floor(Date.now() / 1000);
    const sig = await signRequest(key, 'GET', '/v1/poll', '', now + 120);
    const ok = await verifyRequest(key, 'GET', '/v1/poll', '', now + 120, sig, { now, windowS: 60 });
    expect(ok).toBe(false);
  });
});

describe('Token masking', () => {
  it('round-trips mask/unmask with matching fingerprint', async () => {
    const token = new Uint8Array(32).map((_, i) => i + 1);
    const fp = 'sha256:abcdef';
    const salt = 'salt_xyz';
    const masked = await maskToken(token, fp, salt);
    const recovered = await unmaskToken(masked, fp, salt);
    expect(Array.from(recovered)).toEqual(Array.from(token));
  });

  it('returns garbage on fingerprint mismatch', async () => {
    const token = new Uint8Array(32).map((_, i) => i + 1);
    const masked = await maskToken(token, 'sha256:right', 'salt');
    const recovered = await unmaskToken(masked, 'sha256:wrong', 'salt');
    expect(Array.from(recovered)).not.toEqual(Array.from(token));
  });

  it('throws when token exceeds 32 bytes', async () => {
    const big = new Uint8Array(48);
    await expect(maskToken(big, 'fp', 'salt')).rejects.toThrow(/> 32/);
  });
});
