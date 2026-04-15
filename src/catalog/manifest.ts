export type Platform = 'linux' | 'macos' | 'wsl';

export interface LLRContribution {
  pattern: string;
  targetHypothesis: string;
  llr: number;
}

// Rule-based extractor: regex against probe stdout, capture group 1 = candidate
// value. Emitted as an Observation when matched. If filterAllowlist=true, only
// values that appear in mission.target_allowlist produce observations
// (suppresses noise from probes that return many incidental matches like every
// Host entry in ssh_config).
export interface Extractor {
  pattern: string;          // must match a corresponding LLRContribution.pattern
  regex: string;            // capture group 1 = candidate value
  hypothesis: string;       // must match a corresponding LLRContribution.targetHypothesis
  filterAllowlist?: boolean;
}

export interface ProbeManifest {
  id: string;
  platforms: Platform[];
  bodyByPlatform: Partial<Record<Platform, string>>;
  outputSchema: Record<string, unknown>;
  llrContributions: LLRContribution[];
  extractors?: Extractor[];
  eigPrior: number;
  wallClockEstimateS: number;
  tokenCostEstimate: number;
  fallbackProbeIds: string[];
}

export function isManifest(x: unknown): x is ProbeManifest {
  return validateManifest(x) === null;
}

export function validateManifest(x: unknown): string | null {
  if (typeof x !== 'object' || x === null) return 'not an object';
  const m = x as Record<string, unknown>;
  if (typeof m.id !== 'string' || m.id.length === 0) return 'id required';
  if (!Array.isArray(m.platforms) || m.platforms.length === 0) return 'platforms required';
  for (const p of m.platforms as string[]) {
    if (!['linux', 'macos', 'wsl'].includes(p)) return `bad platform: ${p}`;
    if (typeof (m.bodyByPlatform as Record<string, unknown> | undefined)?.[p] !== 'string') {
      return `bodyByPlatform.${p} required`;
    }
  }
  if (typeof m.eigPrior !== 'number' || m.eigPrior < 0 || m.eigPrior > 1) return 'eigPrior must be in [0,1]';
  if (typeof m.wallClockEstimateS !== 'number' || m.wallClockEstimateS < 0) return 'wallClockEstimateS required';
  if (typeof m.tokenCostEstimate !== 'number' || m.tokenCostEstimate < 0) return 'tokenCostEstimate required';
  if (!Array.isArray(m.llrContributions)) return 'llrContributions required';
  if (!Array.isArray(m.fallbackProbeIds)) return 'fallbackProbeIds required';
  return null;
}
