export interface BundleContents {
  hydra_sh: string;
  masked_token_hex: string;
  salt: string;
  mission_id: string;
  warm_packet: unknown;
  supervisor_url: string;
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
