export interface SuccessPayload {
  mission_id_origin: string;
  mission_id_target: string;
  target_fingerprint: string;
  jump_chain: string[];
  issued_at_ms: number;
}

export interface SuccessCert {
  payload: SuccessPayload;
  signature_b64: string;
}

function toB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromB64(s: string): ArrayBuffer {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;
}

export async function generateKeypair(): Promise<{ publicKeyB64: string; privateKey: CryptoKey }> {
  const kp = await crypto.subtle.generateKey(
    { name: 'Ed25519' } as never,
    true,
    ['sign', 'verify']
  ) as CryptoKeyPair;
  const pub = (await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer;
  return { publicKeyB64: toB64(pub), privateKey: kp.privateKey };
}

export async function signSuccessCert(privateKey: CryptoKey, payload: SuccessPayload): Promise<SuccessCert> {
  const msg = new TextEncoder().encode(JSON.stringify(payload));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sig = await crypto.subtle.sign({ name: 'Ed25519' } as any, privateKey, msg);
  return { payload, signature_b64: toB64(sig as ArrayBuffer) };
}

export async function verifySuccessCert(publicKeyB64: string, cert: SuccessCert): Promise<boolean> {
  const pub = await crypto.subtle.importKey(
    'raw',
    fromB64(publicKeyB64),
    { name: 'Ed25519' } as never,
    false,
    ['verify']
  );
  const msg = new TextEncoder().encode(JSON.stringify(cert.payload));
  return crypto.subtle.verify({ name: 'Ed25519' } as never, pub, fromB64(cert.signature_b64), msg);
}
