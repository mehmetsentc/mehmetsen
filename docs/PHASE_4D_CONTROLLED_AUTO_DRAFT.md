# Phase 4D — Controlled Automatic AI Draft Pipeline

**Status:** Stage 1 LOCAL ONLY — global AI gate **CLOSED**.

**Verdict target:** Controlled event-first auto-draft pipeline ready for production *acceptance* (separate approval). No auto-publish. No paid spend in Stage 1.

## Unit of AI

`EVENT` → eligibility gate → (optional) one AI job → source-once pack (max 3) → DeepSeek → validation → `AI_DRAFT` → editor review → **manual** publish.

Never: raw-article AI jobs, auto-publish, historical reset, homepage rewrite.

## Modes (`CRAWLER_AI_MODE`)

| Mode | Behavior |
|------|----------|
| `OFF` (default) | No automatic job creation |
| `MANUAL_CANARY` | Phase 4C canary only |
| `CONTROLLED_AUTO_DRAFT` | Auto draft when gates+dispatch pass |
| `FULL_AUTO_DRAFT` | Same draft automation; still **no** auto-publish |

There is **no** `AUTO_PUBLISH` mode.

`CONTROLLED_AUTO_DRAFT` also requires `CRAWLER_AI_DISPATCH_ENABLED=true`. Stage 1 keeps both off.

## Eligibility gate (unpaid)

`AI_READY` | `WAITING_FOR_MORE_SOURCES` | `LOW_QUALITY` | `TOO_THIN` | `DUPLICATE` | `STALE` | `EDITOR_REJECTED` | `ALREADY_DRAFTED` | `ALREADY_PUBLISHED` | `COST_BLOCKED` | `MANUAL_ONLY` | `UPDATE_AVAILABLE`

`APPROVED_FOR_AI` ≠ spend. Need `AI_READY` + budget + idempotency + mode/dispatch.

## Cost env

- `AI_MAX_COST_PER_EVENT_USD` (default **$0.01** for controlled path)
- `AI_MAX_DRAFTS_PER_HOUR` / `AI_MAX_DRAFTS_PER_DAY`
- `AI_MAX_DAILY_COST_USD` / `AI_MAX_MONTHLY_COST_USD`

`COST_UNKNOWN` blocks. Crawler continues when AI is blocked.

## Migration

Additive: `0014_phase4d_controlled_auto_draft.sql`

- cluster fingerprints + `auto_draft_status`
- unique active job per cluster
- ledger `reason` / `mode` / `failure_code`

**Do not apply to production in Stage 1 without separate approval.**

## Safety invariants

- `LEGACY_DIRECT_AI_ENABLED=false`
- `CRAWLER_AI_DISPATCH_ENABLED=false` (default)
- `CRAWLER_AI_PROVIDER_ENABLED=false` (default kill switch — mode ≠ permission)
- Provider readiness via `getCrawlerAiProviderReadiness()` — not a permanent hard-false stub
- Historical backlog protected by `CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER` / cohort IDs
- Shared writer: `executeEventDraft` (Phase 4C.4 prompts) for canary + auto-draft
- BODY_TOO_SHORT → no automatic paid repair (4C.4 / 4D.1)
- Drawer: production UI manual verification still required

## Phase 4D.1

Provider wiring + controlled acceptance. Permanent enablement is a separate phase.
When providerReady=false, auto-draft marks `PROVIDER_BLOCKED` and creates **zero** PENDING jobs.
