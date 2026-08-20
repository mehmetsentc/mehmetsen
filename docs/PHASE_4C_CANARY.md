# Phase 4C — DeepSeek Single-Event Canary

**Status:** Phase 4C.2 — output quality calibration + single-request efficiency. Global AI dispatch remains **OFF**.

## Unit of AI

`EVENT` (news cluster) → human selection → compact evidence pack → cost/token preflight → explicit canary confirmation → **ONE** DeepSeek generation → schema validation → `EDITORIAL_DRAFT` / `AI_DRAFT` → human review.

Never auto-publish. Never process `APPROVED_FOR_AI` backlog automatically.

## Boundaries

| Decision | Authorizes spend? |
|----------|-------------------|
| `APPROVED_FOR_AI` | **No** — editorial queue only |
| `APPROVED_FOR_REAL_CANARY_EXECUTION` | Required for paid path |
| `CANARY_PAID_EXECUTION_ENABLED=true` | Required env gate |
| `CRAWLER_AI_DISPATCH_ENABLED` | Must stay **false** |
| `LEGACY_DIRECT_AI_ENABLED` | Must stay **false** |

## Phase 4C.2 — content contract + efficiency

- **Root cause (4C.1):** Model produced ~174-word accurate body; validator hard-min 300 failed. Parser did **not** drop content. Output not truncated (`finish_reason=stop`, 1386/2048 tokens). Paid schema repair incorrectly ran on `BODY_TOO_SHORT`.
- **Source-aware body policy:** deterministic `usableSourceWords` / richness. Rich → 300–900; thin → accurate shorter or `INSUFFICIENT_SOURCE_MATERIAL`. No inventing facts to pad.
- **Paid repair:** only structural malformed JSON. **Never** for `BODY_TOO_SHORT`, insufficient, truncation, cost/auth/rate.
- **Local repair first:** whitespace, fences, trailing commas, enum/slug normalize — never new sentences.
- **Output budget:** `max_tokens` / preflight estimate **3200** (still ≪ $0.05 at peak rates).
- **Metrics:** `requestsPerSuccessfulDraft`, `costPerSuccessfulDraft`, `repairRate`, `firstPassSuccessRate` (safe zero-division; never fake $0).

## Isolation from old multi-stage (~5 requests/event)

Canary does **not** call Stage1 writer / FactChecker / Chief / classifier / SEO-social AI chains.

Target: **1 event → 1 DeepSeek request** (max 2 if structural invalid + one repair).

Ledger lane: `manual_canary` (not `crawler_automatic`).

## Preflight gates

- Token ceiling exceeded → `BLOCKED`
- `COST_UNKNOWN` (missing `DEEPSEEK_*_COST_PER_1M`) → `BLOCKED`
- Estimated cost > **$0.05** → `BLOCKED`
- Limits: events=1, concurrency=1, initial requests=1, max with repair=2

## Migration

Additive: `0013_phase4c_canary_runs.sql` — already applied (no DROP/TRUNCATE).
