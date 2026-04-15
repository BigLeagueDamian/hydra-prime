// Rule-based observation extractor.
//
// Scripts return raw probe output: { stdout, stderr, exit_code, wall_ms }.
// The Bayesian engine consumes structured Observations: { pattern, extracted, hypothesis }.
// This module bridges the two using regex extractors declared in each probe manifest.
//
// Why rule-based, not LLM:
//   - Probe outputs are well-known formats (ssh config, known_hosts, /etc/hosts).
//   - Deterministic, fast, free, no external dependency.
//   - LLM extraction is a v2 path for unstructured/variant outputs.

import type { ProbeManifest } from '../catalog/manifest';

export interface RawProbeOutput {
  stdout?: string;
  stderr?: string;
  exit_code?: number;
}

export interface ExtractedObservation {
  pattern: string;
  extracted: { value: string };
  hypothesis: string;
}

export function extractObservations(
  manifest: ProbeManifest,
  raw: RawProbeOutput,
  targetAllowlist: string[],
): ExtractedObservation[] {
  const out: ExtractedObservation[] = [];
  const stdout = raw.stdout ?? '';
  const extractors = manifest.extractors ?? [];
  if (extractors.length === 0 || stdout.length === 0) return out;

  const seen = new Set<string>();  // dedupe (pattern|value|hypothesis)

  for (const ex of extractors) {
    let re: RegExp;
    try {
      re = new RegExp(ex.regex, 'gm');
    } catch {
      continue;  // bad regex in manifest — skip rather than crash mission
    }
    let m: RegExpExecArray | null;
    while ((m = re.exec(stdout)) !== null) {
      const value = m[1];
      if (typeof value !== 'string' || value.length === 0) continue;
      if (ex.filterAllowlist && !targetAllowlist.includes(value)) continue;
      const key = `${ex.pattern}|${value}|${ex.hypothesis}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ pattern: ex.pattern, extracted: { value }, hypothesis: ex.hypothesis });
    }
  }

  return out;
}
