import { describe, it, expect } from 'vitest';
import { computeValue, urgency } from '../../src/engine/value';

describe('value function', () => {
  it('urgency rises as time_remaining shrinks', () => {
    expect(urgency(86_400)).toBeLessThan(urgency(3_600));
    expect(urgency(60)).toBeGreaterThan(urgency(3_600));
  });

  it('computeValue scales with EIG and inversely with cost', () => {
    const v1 = computeValue({ eig: 0.8, eta_s: 1, tokenCost: 0, timeRemainingS: 80_000, lambda: 0 });
    const v2 = computeValue({ eig: 0.2, eta_s: 1, tokenCost: 0, timeRemainingS: 80_000, lambda: 0 });
    expect(v1).toBeGreaterThan(v2);
  });

  it('lambda penalizes token cost (gold mode)', () => {
    const cheap = computeValue({ eig: 0.5, eta_s: 1, tokenCost: 0, timeRemainingS: 80_000, lambda: 10 });
    const expensive = computeValue({ eig: 0.5, eta_s: 1, tokenCost: 1000, timeRemainingS: 80_000, lambda: 10 });
    expect(cheap).toBeGreaterThan(expensive);
  });

  it('does not divide by zero', () => {
    const v = computeValue({ eig: 1, eta_s: 0, tokenCost: 0, timeRemainingS: 80_000, lambda: 0 });
    expect(Number.isFinite(v)).toBe(true);
  });
});
