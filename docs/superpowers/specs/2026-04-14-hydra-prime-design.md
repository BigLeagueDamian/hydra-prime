# hydra-prime — v1 Design Spec

**Status:** Design locked, awaiting implementation plan.
**Date:** 2026-04-14
**Owner:** BigLeagueDamian

---

## 1. Mission

Hydra-prime is an autonomous goal-seeking organism. Given a target hostname as its sole objective, it lands on a host blind, mines the machine for intelligence, reasons probabilistically about how to reach the target, hops to it carrying its distilled memory, and proves its arrival — all within 24 hours, headless, with no human in the loop after launch.

**Mission statement (one sentence):**
> Hydra-prime lands on a host, rapidly self-hydrates intelligence about the machine and its reachable surfaces, uses an attached LLM-classifier brain to figure out how to reach a designated next host, replicates itself onto that host carrying its accumulated memory, and reboots there — all within 24 hours, with bonus honor for doing it on zero paid tokens.

**Primary v1 mission target:** reach `kvm2` from an origin host chosen by the operator. Target allowlist is operator-configurable per mission.

---

## 2. Honor tiers

| Tier | Definition | Requires |
|---|---|---|
| **Gold** 🟡 | Succeeded on free models only | `paid_tokens == 0` AND verified success AND `wall_clock ≤ 86400s` |
| **Silver** ⚪ | Succeeded but crossed into paid | `paid_usd > 0` AND verified success AND `wall_clock ≤ 86400s` |
| **Failure** 🔴 | Timeout, budget exceeded, codex-terminated, or unreachable-exhausted | (any) |

`strict_gold` operator flag refuses any paid-tier escalation. Mission either completes on free or fails.

---

## 3. Architecture overview

**Two-part system with an asymmetric trust boundary.**

**The Script** — `hydra.sh`, one bash file, target ≤200 lines. Ships to the host. A dumb, obedient, headless remote executor. Six primitives: `register`, `poll`, `exec`, `read`, `report`, `terminate`. No intelligence, no persistence, no decision-making. Trust level: untrusted — the host may be compromised; script assumes hostile-read and takes corresponding precautions.

**The Supervisor** — Cloudflare Worker + Durable Objects + KV + Workers AI. Lives in the operator's Cloudflare account. Hosts the entire agent: belief graph, priority queue, rule engine, probe catalog, LLM router, codex, budget ledger, kill switch, success-proof signer. The supervisor *is* the agent; the script is its remote hands. Trust level: trusted.

**Tick flow:**
1. Script `poll()` → supervisor's MissionDO picks next action, codex-gates, returns primitive directive.
2. Script executes primitive locally.
3. Script `report(op_id, result)` → supervisor ingests, updates Bayesian beliefs deterministically, enqueues follow-up probes, logs.
4. Repeat until terminal state (success, failure, operator kill).

**Key properties:**
- Intelligence is remote. Agent upgrades don't require reshipping the script.
- Kill switch is structural. Killing the DO makes the next poll return `terminate`; script has no brain to resist with.
- Script is uniform across hosts. Platform specifics live in supervisor-served module bodies embedded in `exec` directives.
- Honor tier is tamper-proof. Budget ledger is supervisor-side only.

---

## 4. The Script (hydra.sh)

### Line budget

~120 lines, with ~80 lines of headroom under the 200-line cap.

### Toolchain requirements

Presumes `curl`, `openssl`, `base64`, `sha256sum` on the host. No `jq` in v1 — wire format uses minimal JSON parsed by shell-friendly patterns. Boot fails fast with structured error if any required tool is missing.

### Platforms (v1)

Linux, macOS, WSL. Git-Bash on Windows deferred to v2.

### The six primitives

| Primitive | Input | Output | Notes |
|---|---|---|---|
| `register` | fingerprint, platform, version | mission_id, session_key, poll_interval | One-shot at boot |
| `poll` | mission_id, last_op_id | directive JSON or `{op:"terminate"}` or `{op:"yield", sleep_s:N}` | Long-poll 30s |
| `exec` | cmd, timeout_s | stdout, stderr, exit_code, wall_ms | Runs under `timeout` utility; captures both streams |
| `read` | path, max_bytes | content (base64), size, truncated_flag | Refuses writes outside HYDRA_HOME |
| `report` | op_id, payload envelope | ok | Single reporting channel; all primitives report through this |
| `terminate` | reason | (no return) | Wipe HYDRA_HOME, shred script, exit 0 |

### Boot sequence

1. `HYDRA_HOME = $HOME/.hydra/<mission_id>/` (scoped working directory; all writes confined here).
2. `FINGERPRINT = sha256(hostname + primary_mac + machine_uuid)` where `machine_uuid` follows this fallback chain: Linux → `/etc/machine-id`; macOS → `ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/{print $3}'`; WSL → `/etc/machine-id`; final fallback → first non-removable disk serial via `lsblk -ndo SERIAL` / `diskutil info /`. Closes the cloud-snapshot collision class (identical hostname+MAC after VM clone).
3. Unmask embedded supervisor auth token via `XOR(masked_bytes, HMAC-SHA256(fingerprint, salt))`. Token usable only on the host whose fingerprint matches.
4. `SUPERVISOR_URL` — hardcoded constant in script.
5. Call `register` → receive `mission_id` + session key, or exit quietly if refused.

### Main loop

```
while true:
    directive = poll()
    case directive.op:
        exec      -> result = run_cmd(directive)
        read      -> result = read_file(directive)
        terminate -> cleanup(); exit 0
        yield     -> sleep directive.sleep_s; continue
    report(directive.id, result)
```

No retries, no branching logic, no fallback reasoning in the script. Supervisor owns all decision-making.

### Local self-guards

- No write outside `$HYDRA_HOME`.
- No inbound network listening.
- No `sudo` escalation attempts.
- Supervisor-directed reads of root-owned paths refused with `err:policy`.

These are redundant with supervisor-side codex enforcement but serve as a second fence against bugs or compromised-supervisor scenarios.

---

## 5. The Supervisor

### Components

| Component | Role |
|---|---|
| **Worker** (`hydra-prime-supervisor`) | Stateless entry point. Endpoint handlers. Codex enforcement. LLM pool routing. |
| **MissionDO** (Durable Object) | One instance per mission. Owns belief graph, priority queue, budget ledger, tick log. Global cap = 1 active mission in v1. |
| **Workers AI** | Routine free brain path for `classify` / `extract` only (narrow structured tasks): Cloudflare-native inference (`@cf/meta/llama-3.1-8b-instruct`). Zero network hop from Worker. **Not eligible for `sanity_check` gate calls.** |
| **Groq API** (external) | Primary path for `sanity_check` gate calls AND secondary routine path: `llama-3.3-70b-versatile` on Groq free tier, called from Worker via `GROQ_API_KEY`. 70B-class minimum is mandatory for adversarial codex/hop review. |
| **OpenRouter** (external) | Tertiary path: free models first, paid fallback (silver tier). |
| **KV** (`hydra-prime-kv`) | Rate counters, kill flags, probe catalog (module bodies as strings). |
| **Secrets** (Wrangler) | `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `SIGNING_KEY` (ed25519), `TOKEN_HMAC_SECRET`. Never exposed to the host. |

### External endpoints (script-facing)

All at `https://<worker>.workers.dev/v1/`, HMAC-signed per request with the session key.

| Endpoint | Purpose |
|---|---|
| `POST /register` | Initial handshake |
| `GET /poll?mission=<id>` | Long-poll next directive |
| `POST /report` | Submit primitive result |
| `POST /success` | Submit signed success proof |

### Operator admin endpoints

Authenticated via Cloudflare Access, separate admin key.

| Endpoint | Purpose |
|---|---|
| `POST /admin/mission/start` | Initiate mission; set target, budget ceiling, strict_gold flag |
| `POST /admin/mission/<id>/kill` | Revoke token, flag DO terminated |
| `POST /admin/mission/<id>/pause` | Yield on every poll until resumed |
| `POST /admin/mission/<id>/extend` | Extend budget ceiling or wall-clock deadline |
| `GET /admin/missions` | List active and recent missions with phase, budget, honor tier |
| `GET /admin/mission/<id>/log` | Full tick log including brain transcripts and codex decisions |
| `GET /admin/scoreboard` | HTML live scoreboard |

### Codex enforcement points (v1)

Two gates:

1. **Pre-action gate** — MissionDO checks the codex before translating a typed action into a primitive directive. Disallowed actions never reach the host.
2. **System-prompt prefix** — Every LLM call has the codex injected as un-removable prefix naming the allowlist, budget state, forbidden operations.

(Post-response gate deferred to v2.)

### Mission DO lifecycle

```
registered → provisioning → scanning → hypothesizing →
  → planning → executing-hop → verifying → completed
                                               ↓
              (any state) → failed | terminated
```

Each transition is a logged DO method call.

---

## 6. The agent loop

### Data structures inside MissionDO

**Belief graph** — structured JSON, schema-enforced.

```json
{
  "h:target-address": {
    "type": "target-address",
    "critical": true,
    "candidates": [
      {
        "value": "72.61.65.34",
        "logit": 2.73,
        "posterior": 0.87,
        "evidence": [
          {"note": "ssh-config-scan-1", "source_class": "config-file", "llr": 4.0, "tick": 12}
        ]
      }
    ],
    "status": "converging",
    "collapse_threshold": 0.2,
    "converge_threshold": 0.9,
    "collapse_plan": "enqueue-tier2-probes"
  }
}
```

Hypothesis types: `target-address`, `target-credentials`, `network-path`, `auth-method`, `proxy-jump-chain`.

**Probe queue** — priority-ordered list, each entry carries expected information gain (EIG) prior, wall-clock estimate, token cost estimate, target hypotheses, and fallback_probes.

**Tick log** — append-only. Per tick: phase, action chosen, LLM calls (if any), brain outputs, belief deltas, codex decisions, wall-clock ms, token cost, provider.

### Tick cycle

```
tick(mission_state):
    1. RESTATE OBJECTIVE: compute mission brief
    2. CONTINGENCY CHECK: hypothesis collapse? phase stall? tier exhausted?
    3. PICK ACTION: pop highest-priority, weighted by objective-alignment
    4. CODEX GATE
    5. ATTACH CONTINGENCY: record this action's fallback chain
    6. TRANSLATE to primitive directive
    7. RETURN to script via /poll

ingest(mission_state, op_result):
    8. PARSE RESULT (deterministic if schema'd, LLM extract/classify if free-text)
    9. RULE-ENGINE BELIEF UPDATE
    10. FAILURE → activate contingency if action failed
    11. RESCORE QUEUE (EIG recomputed against updated posteriors)
    12. ENQUEUE FOLLOW-UPS from rule deltas
    13. PERSIST hot vault note
    14. PHASE TRANSITION CHECK
    15. LOG TICK
```

### Mission brief (written every tick)

```json
{
  "goal": "reach kvm2 and signal_success from it",
  "time_remaining_s": 73412,
  "budget_remaining": {"paid_usd": 10.00, "free_tokens_est": 9200000, "tier_status": "gold"},
  "current_best_path": {
    "address_hypothesis": {"candidate": "72.61.65.34", "posterior": 0.87},
    "credential_hypothesis": {"candidate": "~/.ssh/kvm2_ed25519", "posterior": 0.72},
    "auth_method": "ssh-keyfile",
    "confidence_to_attempt_hop": 0.63
  },
  "gap_to_success": [
    "verify credential matches target",
    "resolve 2nd candidate in address hypothesis to <0.1"
  ],
  "last_progress_wall_s": 47
}
```

Written to both DO state and `mission-brief.md` in the hot vault every tick. Injected as system-prompt prefix on every LLM call.

### When the brain is invoked (v1)

Only four call shapes:

- **`classify(text, question)`** — small structured label (yes/no/unclear or enum).
- **`extract(text, schema)`** — parse free-text into typed fields.
- **`route(options)`** — tiebreak when priority ties exactly (rare).
- **`sanity_check(plan)`** — single-model go/no-go on `attempt_hop` plan.

All short context, structured output, small-model-safe. Typical 200–800 tokens.

### Action selection metric

```
value(probe) = EIG(probe | current_beliefs) × urgency(time_remaining)
             / (wc_estimate_s + λ × token_cost)
```

λ tunes cost-vs-speed tradeoff. Gold-track: λ high (tokens dominate). Silver/paid: λ lower (wall-clock dominates).

### What the agent does NOT do (v1)

- No LLM-authored actions. Brain classifies and extracts; queue + EIG decides.
- No free-form reasoning chains. Every brain call is short, specific, structured.
- No runtime code generation. New capabilities = operator-curated catalog updates.
- No self-modification of rules. Rule engine is supervisor code; hydras don't touch it.

---

## 7. Objective clarity & contingency

### Contingency scales (six)

1. **Probe-level** — every queue entry has `fallback_probes[]`. Failure auto-enqueues next entry.
2. **Hypothesis-level** — every hypothesis has a `collapse_plan`. Top candidate posterior drops below threshold → activate plan.
3. **Phase-level** — each phase has a stall timeout (wall-clock). Timeout fires forced phase transition.
4. **Strategy-level** — Tier 1 exhausts → Tier 2 activates. Tier 1+2 exhausts → `unreachable-exhausted` failure in v1.
5. **Budget-level** — `time_remaining` below threshold → compressed-strategy mode (drop low-EIG probes, skip confirmation, lower attempt_hop threshold).
6. **Brain-level** — LLM pool fallback chain: Workers AI → Groq free → OpenRouter free → (silver) OpenRouter paid → Anthropic paid.

### Confidence to attempt hop (computed, not brain-reported)

```
confidence = posterior(h:target-address.top)
           × posterior(h:target-credentials.top_matching_address)
           × feasibility(candidate_auth_method)
           × (1 - unresolved_contradictions)
```

Thresholds (tunable):
- **0.85** — normal `attempt_hop` permission.
- **0.75** — permitted under time pressure.
- **0.60** — permitted under compressed-strategy.

### Stall detection

Wall-clock-based. 15-min threshold default for phase stall. 30-min threshold for mission-critical-hypothesis no-progress.

---

## 8. The Bayesian engine

### Algorithm

**Log-odds naive Bayes across competing candidates within a hypothesis, softmax-normalized.**

- Each candidate carries a `logit` (log-odds).
- Observations contribute log-likelihood ratios (LLRs) from the probe catalog's manifest.
- Updates happen in log-space: `new_logit = old_logit + LLR`.
- Posteriors = softmax(candidate_logits) across the hypothesis.

### Where LLRs come from

Operator-authored in each probe module's manifest. Example:

```json
{
  "id": "ssh-config-scan",
  "observations": [
    {"pattern": "host_entry_matches_target_name", "llr": {"h:target-address": 4.0, "h:target-credentials": 2.5}},
    {"pattern": "no_config_file", "llr": {"h:target-address": -0.3, "h:target-credentials": -0.5}}
  ]
}
```

### v1 simplifications

- No correlation dampening (add in v2).
- No cross-mission LLR refinement via promotion gate (v2).

### Update procedure

```
apply_rules(beliefs, observation, targeted_hypotheses):
    for h in targeted_hypotheses:
        for new_candidate_value in observation.new_candidates:
            add candidate with logit = logit(0.05)

        for candidate in h.candidates:
            llr = observation.llr_by_candidate.get(candidate.value, 0)
            if llr == 0: continue
            candidate.logit += llr
            candidate.evidence.append({note, source_class, llr, tick})

        normalize: posteriors = softmax(candidate.logits)

        if h.top_candidate.posterior < h.collapse_threshold:
            activate h.collapse_plan

        if h.top_candidate.posterior > h.converge_threshold:
            h.status = "converged"

        if is_thrashing(h, recent_wall_s=300):
            enqueue_disambiguating_probe(h)
```

### LLM role in the engine

- **`extract`** — parse free-text observation into typed fields.
- **`classify`** — label an extracted string to determine which `observation.pattern` applies.
- LLM never touches logits, LLRs, or posteriors.

---

## 9. The probe catalog (v1)

### Format

Bash snippets stored as strings in KV, referenced by `module_id`. Each has a manifest declaring platforms, output schema, LLR contributions, EIG prior, wall-clock estimate, and fallback module list.

### Delivery

Supervisor inlines module bodies directly in `exec` directives. Script has no fetch/verify/sandbox code (dropped from v1 primitives).

### v1 starter catalog — 10 probes

**Tier 1 — SSH-adjacent (5 probes)**
1. `ssh-config-scan` — parse `~/.ssh/config`, `/etc/ssh/ssh_config`.
2. `known-hosts-enum` — extract all hosts from `~/.ssh/known_hosts`.
3. `private-key-enum` — inventory private keys, fingerprint, pair with known_hosts.
4. `shell-history-grep` — grep bash/zsh/fish history for SSH-relevant tokens.
5. `hosts-file` — `/etc/hosts`, `/etc/hosts.d/*`.

**Tier 2 — infra reach (5 probes)**
6. `cloud-cli-enum` — detect `aws`, `gcloud`, `az`, `doctl`, `hcloud`; list reachable instances.
7. `k8s-context-enum` — parse `~/.kube/config`; test `kubectl auth can-i` per context.
8. `vpn-mesh-probe` — `tailscale status`, `wg show`, `nmcli con show --active`.
9. `docker-compose-scan` — find and parse docker-compose files.
10. `git-config-scan` — `~/.gitconfig`, discovered `.git/config` files.

Tiers 3-5 (credential discovery beyond SSH, network recon, compounding context) added in v2.

### Cross-platform

Each probe has Linux / macOS / WSL variants in the catalog. Supervisor serves the variant matching the platform reported at `register`.

---

## 10. The hop

### Gates before `attempt_hop` is permitted

1. **Confidence threshold** — `confidence_to_attempt_hop` exceeds active threshold (0.85 / 0.75 / 0.60 per mode).
2. **Codex approval** — allowlist check, mutation check, hop action permitted.
3. **Single-model sanity check** (v1) — single provider reviews plan against codex, returns GO/NO_GO. (Dual-model in v2.)

### Phase 1 — Distillation (supervisor-side, ≤ 60s)

Warm packet includes:
- Current belief graph (full)
- Mission brief history (trajectory)
- Current priority queue snapshot
- Tick log summary
- Catalog module ID list
- Honor-tier state
- Codex pin (hash)

Excludes: full brain transcripts, supervisor token.

**Pre-hop distillation checklist (enforced — hop blocks on failure):**
1. All converged hypotheses include top-3 candidates with full evidence chain.
2. Last 20 tick log entries included.
3. For every still-open hypothesis, every raw probe output referenced by its evidence chain is either (a) promoted verbatim into the packet, or (b) the hypothesis is closed/demoted before hop.
4. Packet total ≤ 2 MB after base64 encoding; if over, lowest-EIG open hypotheses are closed until under cap, or hop fails with `distillation-oversize`.

This turns "raw outputs lost on origin cleanup" from silent data loss into an explicit gate: a hop cannot proceed while the target would need evidence the packet doesn't carry.

Packet signed with supervisor's signing key.

### Phase 2 — Bootstrap bundle

Bundle = fresh hydra.sh + new masked token (masked against expected target fingerprint) + signed warm packet + bootstrap command. Base64-packed, ≤ 2 MB.

### Phase 3 — `exec` directive composing SSH hop

Supervisor composes a single `exec` directive with the full SSH command:

```bash
ssh -i $CREDS_PATH -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 \
    -o BatchMode=yes $TARGET_USER@$TARGET_HOST "$BOOTSTRAP_CMD"
```

Payload streamed via stdin over the same connection. One atomic operation.

### Phase 4 — Rehydration on target

Target's hydra.sh boots, unmasks its token using its fingerprint, calls `/register` with resume metadata. Supervisor:
1. Verifies packet signature.
2. Assigns new mission_id linked to origin as `jump_chain`.
3. Reconstructs MissionDO state from packet.
4. Transitions to `verifying` phase with queued `signal_success`.

Target inherits origin's budget, time remaining, honor tier. Clock continues; no reset.

### Phase 5 — Success proof

Agent on target submits:
```json
{
  "mission_id_origin": "...",
  "mission_id_target": "...",
  "target_fingerprint": "sha256:...",
  "target_evidence": {"hostname": "...", "uname": "..."},
  "jump_chain": ["origin", "kvm2"]
}
```

Supervisor verifies fingerprint matches expected target, signs a success certificate, marks mission complete, returns `terminate` directive.

### Phase 6 — Origin cleanup

Supervisor sends separate `terminate` to origin mission. Origin wipes vault, self-deletes script.

### Retry economy

Max 5 full hop attempts per mission. Each failure decrements posterior on the path components (credential, address, network-path) and may trigger tier-cascade contingency.

---

## 11. Codex (non-negotiable rules enforced by supervisor)

### §1 Scope
- **§1.1** Authorized hosts only. Initial allowlist: origin, kvm2, kvm4, plus operator-added.
- **§1.2** No third-party exfiltration. Data flows only to operator-owned supervisor, authorized hosts.
- **§1.3** Read before write. No mutation on origin except vault writes, self-delete, sanctioned SSH-out.

### §2 Lifecycle
- **§2.1** 24h hard cap. Supervisor revokes token at `t+86400`.
- **§2.2** Budget cap. Default $10 paid ceiling. `strict_gold=true` kills on first paid token.
- **§2.3** Self-deletion on terminal state, 60s SLA.
- **§2.4** No persistence beyond mission. No service install, no cron, no user-scope hooks.

### §3 Identity & tamper-resistance
- **§3.1** Codex is read-only to agent.
- **§3.2** Supervisor token non-extractable in use (XOR-masked with fingerprint).
- **§3.3** Success proof unforgeable (supervisor-signed, target fingerprint required).
- **§3.4** Kill switch binding.

### §4 Action integrity
- **§4.1** Mandatory single-model sanity check on `attempt_hop`, `signal_success`, critical belief updates. **70B-class minimum** — Workers AI 8B is disallowed for gate calls. Provider order: Groq `llama-3.3-70b-versatile` (free) → OpenRouter free 70B-class → OpenRouter paid (silver) → Anthropic paid. If `strict_gold=true` AND all free 70B-class paths are exhausted/rate-limited, hop fails closed with `sanity-unavailable` — no degradation to 8B review. Non-strict missions MAY proceed on 8B sanity with a logged codex warning and an automatic posterior penalty on the hop path. (Dual-model in v2.)
- **§4.2** Codex-first synthesis.
- **§4.3** Logged deliberation.

### §5 Honesty & scoring
- **§5.1** Truthful budget reporting. Supervisor owns authoritative ledger.
- **§5.2** No success-predicate tampering.
- **§5.3** Truthful tick logging.

### §6 Operator overrides
- **§6.1** Operator is supreme.
- **§6.2** Emergency stop is free, no grace beyond 60s self-destruct.

---

## 12. Clock discipline

| Quantity | Measured in |
|---|---|
| 24h deadline | Wall-clock |
| Phase stall thresholds | Wall-clock |
| Contradiction thrashing detection | Wall-clock |
| Rate limits | Wall-clock |
| `ticks_to_converge` | Logical tick count (decision complexity metric) |
| Evidence ordering | Logical tick count |
| `last_update_tick` on hypotheses | Logical tick count |

A **tick** = one `poll → execute → report → ingest` cycle. Logical counter, monotonic, not a time unit.

---

## 13. Out of scope for v1 (v2 roadmap)

| Feature | Reason deferred |
|---|---|
| Multi-hydra concurrency | Single-mission simpler; concurrency primitives add DO complexity |
| Cold RAG (Vectorize + R2) | DO-inline storage sufficient for single mission; Vectorize adds infrastructure |
| `hydra-wisdom` + promotion gate | Requires completed mission corpus before meaningful promotion |
| Dual-model cross-check on `attempt_hop` | Single-model gate + codex + confidence threshold provides baseline safety |
| Catalog versioning + signed manifests | Mutable strings in KV sufficient for v1 scale |
| Post-response codex gate | Two gates cover primary risk; third gate adds complexity without proportional gain |
| Tier 3-5 probes (10 more modules) | Tier 1+2 sufficient for operator-launched missions on workstations |
| Git-Bash platform support | Linux + macOS + WSL cover operator hosts |
| Correlation dampening in Bayesian engine | Simple naive Bayes may over-weight but won't fail for v1 |

---

## 14. Success criteria for v1

**Build-complete when:**
- [ ] `hydra.sh` is ≤200 lines, handles all six primitives, passes boot on Linux / macOS / WSL
- [ ] Supervisor deployed on Cloudflare with all endpoints functional
- [ ] 10-probe catalog seeded with manifests and LLRs
- [ ] Codex §1–§6 enforced at pre-action and system-prompt-prefix gates
- [ ] Honor tier calculation tamper-proof
- [ ] Operator admin endpoints (kill, pause, extend, list, scoreboard) live
- [ ] End-to-end test: launch on a dummy origin VM, reach a dummy target, verify signed success

**Mission-complete (first real run) when:**
- [ ] Hydra-prime launches on operator's chosen origin host
- [ ] Within 24h, reaches kvm2 and submits signed success proof
- [ ] Honor tier recorded, tick log preserved, origin self-deleted
- [ ] Post-mortem report generated (no promotion gate in v1, so report is informational)

**Gold tier (stretch for v1):**
- [ ] First mission completes with `paid_tokens == 0`

---

## 15. Open questions for implementation phase

1. **HMAC salt baked into script vs. supplied at launch?** Baking is simpler; per-mission salt supplied at launch gives an additional revocation axis.
2. **Mission DO storage ceiling.** **Resolved:** 4 MB inline hard cap per mission. Exceeding fails the mission. No partial R2 integration in v1. Pre-hop distillation checklist (§10 Phase 1) governs what crosses the hop boundary.
3. **Platform fingerprint collision.** **Resolved:** fingerprint extended to `sha256(hostname + primary_mac + machine_uuid)` with OS-specific UUID fallback chain (§4 boot). Closes the cloud-snapshot collision class.
4. **`accept-new` for StrictHostKeyChecking vs. pre-seeded known_hosts entry.** `accept-new` is simpler and safe on first hop; requires audit trail in tick log.
5. **Default Bayesian thresholds (0.85 / 0.75 / 0.60 / 0.2 / 0.9).** Tuning via first real missions; spec sets initial values.
6. **Sanity-check model tier.** **Resolved:** 70B-class minimum, Groq `llama-3.3-70b-versatile` primary; strict_gold fails closed if free 70B-class unavailable (§11 §4.1).

---

## 16. Implementation plan

Next step: invoke `writing-plans` skill to produce a sequenced implementation plan covering:

- Supervisor scaffolding (Cloudflare project, DOs, KV, Workers AI bindings)
- Codex enforcement core
- MissionDO state machine + tick engine
- Bayesian rule engine
- Probe catalog seeding (10 modules × 3 platforms)
- hydra.sh script (six primitives, boot sequence, main loop)
- HMAC request signing (both sides)
- Success proof signing/verification
- Admin endpoints + scoreboard
- End-to-end integration test harness
- First live mission dry-run on throwaway VMs
