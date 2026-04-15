# hydra-prime live dry-run

Run on operator's machine against two throwaway VMs.

## Prerequisites
- Cloudflare account with hydra-prime-supervisor deployed (`wrangler deploy`)
- `WORKER_URL` (e.g. https://hydra-prime-supervisor.acct.workers.dev)
- `ADMIN_KEY` set as Wrangler secret matching `--key` arg below
- Two reachable VMs: ORIGIN_HOST (where script lands) and TARGET_HOST (allowlisted)
- SSH key already present on ORIGIN_HOST that authorizes TARGET_HOST
- `gcloud`/`ssh` configured to reach ORIGIN_HOST

## Steps
1. `bash scripts/live-dryrun.sh \
     --worker https://... \
     --key <ADMIN_KEY> \
     --origin user@origin.example \
     --target target.example \
     --target-fingerprint $(ssh user@origin.example "hostname && cat /etc/machine-id")`

2. Watch scoreboard: open `<WORKER_URL>/v1/admin/scoreboard` (with X-Admin-Key header)
3. Mission must reach phase=completed within 24h, honor_tier=gold preferred.

## Failure modes
- 401: ADMIN_KEY mismatch
- mission stuck in scanning: probes returned no signal — tighten target naming or seed `~/.ssh/config`
- SanityUnavailable: Groq + OpenRouter both unavailable AND strict_gold — fail closed is correct
