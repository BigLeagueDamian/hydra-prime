import type { WarmPacket } from './distill';

const MAX_PACKET_BYTES = 2_000_000;

export interface ChecklistResult {
  ok: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

export function enforcePreHopChecklist(packet: WarmPacket): ChecklistResult {
  const json = JSON.stringify(packet);
  if (json.length > MAX_PACKET_BYTES) {
    return { ok: false, reason: 'distillation-oversize', details: { bytes: json.length } };
  }
  for (const [id, h] of Object.entries(packet.belief_graph)) {
    if (h.critical !== false && h.status === 'open') {
      const hasEvidence = h.candidates.some(c => c.evidence.length > 0);
      if (!hasEvidence) {
        return { ok: false, reason: 'missing-evidence', details: { hypothesis: id } };
      }
    }
  }
  return { ok: true };
}
