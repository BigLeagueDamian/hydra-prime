import type { ProbeManifest } from './manifest';

// Modules are appended in Tasks 22-23. Empty array makes the validation
// harness pass on an empty set; it.each over an empty array is a no-op.
export const ALL_PROBES: ProbeManifest[] = [];
