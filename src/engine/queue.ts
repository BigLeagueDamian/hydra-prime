export interface QueueEntry {
  id: string;
  probeId: string;
  value: number;
  eta_s: number;
  tokenCost: number;
  targetHypotheses: string[];
  fallbackIds: string[];
}

export interface PriorityQueue {
  entries: QueueEntry[];
}

export function newQueue(): PriorityQueue { return { entries: [] }; }
export function size(q: PriorityQueue): number { return q.entries.length; }
export function enqueue(q: PriorityQueue, e: QueueEntry): PriorityQueue {
  return { entries: [...q.entries, e] };
}
export function popHighest(q: PriorityQueue): [QueueEntry | undefined, PriorityQueue] {
  if (q.entries.length === 0) return [undefined, q];
  const sorted = [...q.entries].sort((a, b) => b.value - a.value);
  const [top, ...rest] = sorted;
  return [top, { entries: rest }];
}
export function rescore(q: PriorityQueue, fn: (e: QueueEntry) => QueueEntry): PriorityQueue {
  return { entries: q.entries.map(fn) };
}
