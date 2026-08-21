# Phase 4F.1 — Automatic AI-READY Promotion (Design A)

**Status:** Architecture + zero-cost production acceptance. Default mode **OFF**. No paid AI in this phase.

## Design A

| Concern | Field | Owner |
|---------|-------|-------|
| Human editorial | `editorial_decision` (`NONE` / `APPROVED_FOR_AI` / `REJECTED` / …) | **Human only** |
| Machine eligibility | `machine_draft_eligibility` (`AUTO_DRAFT_ELIGIBLE` / waiting / blocked…) | **Machine only** |

Machine automation **never** writes `APPROVED_FOR_AI`.

## Two entry paths (same worker)

1. **Automatic:** fresh event → gate → `AUTO_DRAFT_ELIGIBLE` → (mode+cutoff+budget) → PENDING job  
2. **Manual:** human *AI için Onayla* / AI Taslağı → same `crawler_ai_jobs` → dedicated worker → `executeEventDraft` → `draft_snapshot`

## WATCHING rule

- Weak single-source `WATCHING` → `WAITING_FOR_MORE_SOURCES` (no spend)
- Multi-source (ind≥2) that passes quality → `AUTO_DRAFT_ELIGIBLE`
- Strong-single (Phase 4E thresholds, not lowered) → `AUTO_DRAFT_ELIGIBLE`

## Cutoff

`CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER` **required** for automatic path. Uses event `createdAt` / `firstSeenAt`. Unset → `CUTOFF_UNSET` (auto refuses). Manual paths may still work at their call sites.

## Enqueue vs spend

| | MODE OFF | MODE ON + provider OFF | MODE ON + provider ON |
|--|----------|-------------------------|------------------------|
| Classify machine eligibility | yes | yes | yes |
| Create PENDING jobs | no | yes | yes |
| Paid DeepSeek | no | no (worker refuses) | yes (worker only) |

## Admin UI

- **Editoryal karar** = human (`APPROVED_FOR_AI` = “AI için onaylandı”)
- **AI uygunluğu / Otomatik seçim** = machine (never shown as editor approval)

## Migration

`0017_phase4f1_machine_eligibility.sql` — ADD COLUMN / INDEX only.

## Local verify

```bash
npx vitest run src/services/crawler/autoDraft/phase4f1.test.ts src/services/crawler/autoDraft/phase4f.policy.test.ts
npx vitest run src/services/crawler/autoDraft/phase4e1.test.ts src/services/crawler/autoDraft/phase4e.test.ts
npx tsc --noEmit
npm run build
```

**Do not enable CONTROLLED_AUTO_DRAFT for 4F.1 acceptance.** Prove classification with MODE OFF.
