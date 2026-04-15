import { describe, it, expect } from 'vitest';
import { generateKeypair, signSuccessCert, verifySuccessCert } from '../../src/proof/sign';

describe('ed25519 success cert', () => {
  it('round-trips sign/verify', async () => {
    const { publicKeyB64, privateKey } = await generateKeypair();
    const cert = await signSuccessCert(privateKey, {
      mission_id_origin: 'm_origin', mission_id_target: 'm_target',
      target_fingerprint: 'sha256:fp', jump_chain: ['m_origin', 'm_target'],
      issued_at_ms: 1700000000_000,
    });
    const ok = await verifySuccessCert(publicKeyB64, cert);
    expect(ok).toBe(true);
  });

  it('rejects tampered cert', async () => {
    const { publicKeyB64, privateKey } = await generateKeypair();
    const cert = await signSuccessCert(privateKey, {
      mission_id_origin: 'mO', mission_id_target: 'mT',
      target_fingerprint: 'fp', jump_chain: ['mO', 'mT'], issued_at_ms: 1,
    });
    const tampered = { ...cert, payload: { ...cert.payload, mission_id_target: 'mEvil' } };
    expect(await verifySuccessCert(publicKeyB64, tampered)).toBe(false);
  });
});
