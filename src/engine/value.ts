export interface ValueInputs {
  eig: number;
  eta_s: number;
  tokenCost: number;
  timeRemainingS: number;
  lambda: number;
}

export function urgency(timeRemainingS: number): number {
  // 1.0 at 24h, ramps to ~3.0 as we approach 0.
  const total = 86_400;
  const frac = Math.max(0.001, timeRemainingS / total);
  return 1 + 2 * (1 - frac);
}

export function computeValue(i: ValueInputs): number {
  const denom = Math.max(0.1, i.eta_s + i.lambda * i.tokenCost);
  return (i.eig * urgency(i.timeRemainingS)) / denom;
}
