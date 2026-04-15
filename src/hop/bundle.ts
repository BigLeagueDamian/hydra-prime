export interface BundleContents {
  hydra_sh: string;
  masked_token_hex: string;
  salt: string;
  mission_id: string;
  warm_packet: unknown;
  supervisor_url: string;
  // Plaintext session key the target script uses to sign /v1/success. v1 hop
  // doesn't use the masked_token+salt fingerprint-binding flow because target
  // fingerprint is unknown at hop-emit time. Bundle confidentiality is enforced
  // by the SSH transport (key auth required to deposit it).
  session_key?: string;
}

export function composeBootstrapBundle(c: BundleContents): string {
  const json = JSON.stringify(c);
  // btoa requires latin-1; use a UTF-8 safe round-trip.
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeBootstrapBundle(b64: string): BundleContents {
  const json = decodeURIComponent(escape(atob(b64)));
  return JSON.parse(json) as BundleContents;
}
