import { describe, it, expect } from 'vitest';
import { newQueue, enqueue, popHighest, rescore, size } from '../../src/engine/queue';

describe('priority queue', () => {
  it('pops in descending priority', () => {
    let q = newQueue();
    q = enqueue(q, { id: 'p1', probeId: 'a', value: 0.3, eta_s: 5, tokenCost: 0, targetHypotheses: [], fallbackIds: [] });
    q = enqueue(q, { id: 'p2', probeId: 'b', value: 0.9, eta_s: 5, tokenCost: 0, targetHypotheses: [], fallbackIds: [] });
    q = enqueue(q, { id: 'p3', probeId: 'c', value: 0.5, eta_s: 5, tokenCost: 0, targetHypotheses: [], fallbackIds: [] });
    const [first, q1] = popHighest(q);
    expect(first?.id).toBe('p2');
    const [second] = popHighest(q1);
    expect(second?.id).toBe('p3');
  });

  it('size tracks correctly', () => {
    let q = newQueue();
    expect(size(q)).toBe(0);
    q = enqueue(q, { id: 'x', probeId: 'a', value: 0.5, eta_s: 1, tokenCost: 0, targetHypotheses: [], fallbackIds: [] });
    expect(size(q)).toBe(1);
  });

  it('rescore replaces value via fn', () => {
    let q = newQueue();
    q = enqueue(q, { id: 'p1', probeId: 'a', value: 0.3, eta_s: 5, tokenCost: 0, targetHypotheses: [], fallbackIds: [] });
    q = rescore(q, e => ({ ...e, value: 0.8 }));
    const [top] = popHighest(q);
    expect(top?.value).toBe(0.8);
  });
});
