# Phase 4C — DeepSeek Single-Event Canary (Stage 1)

**Status:** Stage 1 local controls only. No production deploy. No paid DeepSeek call. No automatic dispatch.

## Unit of AI

`EVENT` (news cluster) → human selection → compact evidence pack → cost/token preflight → explicit canary confirmation → **ONE** DeepSeek generation → schema validation → `EDITORIAL_DRAFT` / `AI_DRAFT` → human review.

Never auto-publish. Never process `APPROVED_FOR_AI` backlog automatically.

## Boundaries

| Decision | Authorizes spend? |
|----------|-------------------|
| `APPROVED_FOR_AI` | **No** — editorial queue only |
| `APPROVED_FOR_REAL_CANARY_EXECUTION` | Required for paid path (Stage 2+) |
| `CANARY_PAID_EXECUTION_ENABLED=true` | Required env gate |
| `CRAWLER_AI_DISPATCH_ENABLED` | Must stay **false** |
| `LEGACY_DIRECT_AI_ENABLED` | Must stay **false** |

## Isolation from old multi-stage (~5 requests/event)

Canary does **not** call Stage1 writer / FactChecker / Chief / classifier / SEO-social AI chains.

Target: **1 event → 1 DeepSeek request** (max 2 if structural invalid + one repair).

Ledger lane: `manual_canary` (not `crawler_automatic`).

## Selection preferences (helpers only in Stage 1)

Prefer: local admin / culture / tourism / education / economy / tech / sports / local development.  
Avoid: death / disaster / terrorism / crime allegation / medical / election / high-risk breaking.

## Preflight gates

- Token ceiling exceeded → `BLOCKED`
- `COST_UNKNOWN` (missing `DEEPSEEK_*_COST_PER_1M`) → `BLOCKED`
- Estimated cost > **$0.05** → `BLOCKED`
- Limits: events=1, concurrency=1, initial requests=1, max with repair=2

## Admin UX

Cluster detail → **Preflight Göster** (`GET /api/admin/crawler/clusters/:id/canary`).  
**CANARY'Yİ ÇALIŞTIR** is locked in Stage 1.

## Migration

Additive: `0013_phase4c_canary_runs.sql` — **do not apply to production in Stage 1**.

## Stage 2 (future prompt)

Deploy → migrate → select ONE event → show preflight → **STOP for user approval** before paid call.
