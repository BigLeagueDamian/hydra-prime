const enc = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify'],
  );
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function signRequest(
  sessionKey: string, method: string, path: string, body: string, ts: number,
): Promise<string> {
  const key = await hmacKey(sessionKey);
  const msg = `${method}\n${path}\n${body}\n${ts}`;
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return toHex(sig);
}

export async function verifyRequest(
  sessionKey: string, method: string, path: string, body: string, ts: number, sigHex: string,
  opts?: { now?: number; windowS?: number },
): Promise<boolean> {
  const now = opts?.now ?? Math.floor(Date.now() / 1000);
  const window = opts?.windowS ?? 60;
  if (Math.abs(now - ts) > window) return false;
  const expected = await signRequest(sessionKey, method, path, body, ts);
  if (expected.length !== sigHex.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sigHex.charCodeAt(i);
  return diff === 0;
}

export async function maskToken(token: Uint8Array, fingerprint: string, salt: string): Promise<Uint8Array> {
  if (token.length > 32) throw new Error(`maskToken: token length ${token.length} > 32 (HMAC-SHA256 output limit)`);
  const key = await hmacKey(salt);
  const mask = await crypto.subtle.sign('HMAC', key, enc.encode(fingerprint));
  const m = new Uint8Array(mask).slice(0, token.length);
  const out = new Uint8Array(token.length);
  for (let i = 0; i < token.length; i++) out[i] = token[i]! ^ m[i]!;
  return out;
}

export async function unmaskToken(masked: Uint8Array, fingerprint: string, salt: string): Promise<Uint8Array> {
  return maskToken(masked, fingerprint, salt);
}

export { fromHex, toHex };
