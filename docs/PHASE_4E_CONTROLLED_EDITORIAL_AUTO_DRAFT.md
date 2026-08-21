# Phase 4E — Controlled Editorial Auto-Draft Rollout

**Status:** LOCAL ONLY — no production deploy, no paid AI, default mode **OFF**.

**Goal:** Fresh high-quality events → controlled automatic AI drafts → humans publish.

**Not in scope:** AUTO_PUBLISH, FULL_AUTO_DRAFT enablement, registry expansion, production migration.

## Modes

| Mode | Phase 4E |
|------|----------|
| `OFF` (default) | No automatic jobs |
| `MANUAL_CANARY` | Manual canary only |
| `CONTROLLED_AUTO_DRAFT` | Auto **enqueue** when gates + dispatch + cutoff + budget pass. Provider OFF still allows PENDING jobs; paid spend only in AI worker when provider ready. |
| `FULL_AUTO_DRAFT` | Parsed for future; **not enabled** in this phase |

## Hard cost defaults (server-side)

- Per event: **$0.01**
- Concurrency: **1**
- Jobs / worker invocation: **1**
- Drafts / hour: **2**
- Drafts / day: **10**
- Daily cost: **$0.05**
- Monthly cost: **$5.00**

`COST_UNKNOWN` → block. Crawler continues when AI stops.

## STRONG_SINGLE_SOURCE thresholds

**Local / breaking path:** words≥120, conf≥0.7, health≥60, stale≤48h, and (local geo OR BREAKING OR importance≥70)

**High-quality trusted path:** words≥150, conf≥0.75, health≥70, stale≤36h, importance≥40

No fake city/importance boosts. Çanakkale is a **ranking** boost only.

## Historical firewall

`CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER` and/or `CRAWLER_AI_ACCEPTANCE_COHORT_IDS` required.

## Admin

- Event-first: PRIMARY + SUPPORTING on Olay Detayı
- Ham Haber active queue hides SUPPORTING/DUPLICATE clutter (`eventPrimaryOnly`, override with `includeSupporting=1`)
- PUBLISHED stays out of active Ham Haber
- `GÜNCELLEME VAR` / `UPDATE_AVAILABLE` — no automatic second spend
- AI Taslakları failure reasons in Turkish

## Migration

No new migration required for Phase 4E local stage (builds on 0014–0016). Additive only if schema changes become necessary later.

## Phase 4E.1 — enqueue path hardening

**P0 root cause (4E production gap):** `listApprovedCandidates` sliced the ranked pool to `CRAWLER_AI_MAX_EVENTS_PER_TICK` (default **1**) *before* activation cutoff filtering. Production cron therefore evaluated only the top-ranked historical `APPROVED_FOR_AI` cluster → `BEFORE_ACTIVATION_CUTOFF` → **0 jobs**. Local acceptance used `limit: 5`, scanned past historical rows, and enqueued Event1.

**Fix:** scan a wide ranked pool; apply `maxEventsPerTick` only to successful enqueues after cutoff/gates.

**Enqueue vs paid:** CONTROLLED + dispatch may create PENDING jobs when provider is OFF. Dedicated AI worker refuses claim/spend until provider ready. Crawler never calls DeepSeek.

```bash
npx vitest run src/services/crawler/autoDraft/phase4e1.test.ts
npx vitest run src/services/crawler/autoDraft/phase4e.test.ts
npx tsc --noEmit
npm run build
```

## Local verification

```bash
npx vitest run src/services/crawler/autoDraft/phase4e.test.ts
npx tsc --noEmit
npm run build
```
