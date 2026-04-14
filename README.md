# hydra-prime

An autonomous goal-seeking organism. Lands on a host blind, mines the machine for intelligence, reasons probabilistically about how to reach a designated target, hops to it carrying distilled memory, and proves arrival — all within 24 hours, headless, with honor for doing it on zero paid LLM tokens.

**Status:** Design locked. Implementation pending.

---

## Two-part system

- **`hydra.sh`** — one bash file, ≤200 lines. Ships to the host. A dumb remote executor. Six primitives: `register`, `poll`, `exec`, `read`, `report`, `terminate`. No intelligence lives here.
- **Supervisor** — Cloudflare Worker + Durable Objects + KV + Workers AI. Lives in the operator's cloud. Hosts the entire agent: belief graph, Bayesian engine, codex, probe catalog, brain router, budget ledger, kill switch.

The host is untrusted. The supervisor is trusted. The script is the supervisor's remote hands; the supervisor is the agent.

## Mission

> Lands on host → self-hydrates intelligence → figures out how to reach a target → hops with memory → rehydrates → proves arrival. All within 24h. Honor for completing on free models only.

## Honor tiers

- 🟡 **Gold** — succeeded on free models only
- ⚪ **Silver** — succeeded but crossed into paid
- 🔴 **Failure** — timeout, budget exceeded, or unreachable-exhausted

## Related

- **[hydra](https://github.com/BigLeagueDamian/hydra)** — sibling project. A single-shot passive scanner that emits an Obsidian vault documenting what it learned about a host. Hydra is an organism that observes; hydra-prime is an organism that acts.

## Design

See [`docs/superpowers/specs/2026-04-14-hydra-prime-design.md`](docs/superpowers/specs/2026-04-14-hydra-prime-design.md) for the full v1 design spec.

## License

MIT.
