# Phase P11 — Publisher Platform Activation + Controlled Rollout

## Goal

Activate P1–P10 for real publisher use **without** payment, mass flags, or mass activation.

Journey: source → publisher profile → claim → verify → Studio → profile/news → inventory → managed ad → analytics.

## Activation order (encoded)

1. PLATFORM  
2. STUDIO  
3. PROFILE_COMPOSER  
4. CONTENT_STUDIO  
5. MANUAL_PUBLISH  
6. MEDIA_UPLOAD  
7. SOCIAL_GRAPH / USER_PROFILES (stage 4 — staging/cohort)  
8. SMART_FEED (+ ranking / cold-start)  
9. AD_INVENTORY  
10. SELF_MANAGED_ADS  
11. AD_SERVING  
12. AD_ANALYTICS  
13. VIDEO_PREROLL  

Wrong combinations are rejected via `resolveFeatureForPublisher` (`dependency_blocked`).

## Rollout stages

| Stage | Name | Intent |
|------:|------|--------|
| 0 | dark | Tooling only; all globals false |
| 1 | internal | Internal allowlist smoke |
| 2 | selected_verified | 1–3 admin-selected VERIFIED publishers |
| 3 | onboarding_open | Claim + Studio checklist for cohort |
| 4 | consumer_feed_social | Smart Feed/social staging — not main feed |
| 5 | self_managed_ads_public | Serving for allowlisted verified only |

## Allowlist

- Table: `publisher_feature_access` (migration `0034`)
- Admin APIs:  
  - `GET/PUT /api/admin/publishers/[id]/feature-access`  
  - `GET /api/admin/publishers/rollout?stage=0..5`
- Security: CMS `system:settings` only; publishers cannot modify; cross-publisher blocked by membership checks; ads grants require VERIFIED.
- Audit: `PUBLISHER_FEATURE_ENABLED` / `PUBLISHER_FEATURE_DISABLED`
- Rollback: set `enabled=false` or flag OFF — **never** delete publisher/content/ad rows.

## Operator checklist (manual — do not auto-activate)

1. Confirm production globals remain `false`.
2. Apply migration 0034: `npx tsx scripts/_phase_p11-apply-0034.mts --apply`
3. Pre-flight: `npx tsx scripts/_phase_p11-inventory.mts`
4. Bootstrap 5 sources dry-run: `npx tsx scripts/_phase_p11-bootstrap-5.mts`
5. Review CREATE / LINK_EXISTING / SKIP / AMBIGUOUS / ERROR — live only if safe (`--live`).
6. Admin: claim approve for pilot publishers (existing CMS flow).
7. Grant pilot bundle via `PUT .../feature-access` `{ "grantPilotBundle": true }` (verified only).
8. Smoke: claim→studio, content publish, layout, inventory, managed ad, analytics.
9. Financial isolation: `payment_intents`, `payment_transactions`, `commercial_ledger_entries`, `publisher_earnings` unchanged.
10. Do **not** enable Smart Feed / social globally; staging only.

## Full registry backfill (later — separate)

- Do **not** run unlimited bootstrap against all `news_sources`.
- Later checklist: sample cohorts by city → dry-run → review ambiguous domains → live batches ≤25 → idempotency pass → dup domain/source checks.

## Payment

**DISABLED.** P10A stays dark. No checkout/payout testing on production.

## P11.1 controlled pilot (INTERNAL_TEST)

- Create a `publisherType=INTERNAL_TEST` publisher (e.g. `nahaber-test-yayincisi`) — never claim/verify the 5 bootstrap media sources.
- Exclude from public discovery / sitemap / Smart Feed; force SEO noindex on profile + published pilot articles.
- Grant pilot bundle via allowlist only (`grantPilotBundle`); globals stay false.
- Smoke: `npx tsx scripts/_phase_p11_1-pilot-smoke.mts` (service-layer; forces `NODE_ENV=production` + flags false).
- After smoke: AD_SERVING grant OFF + ad archived; audit/impression rows kept.
- Rollback = disable allowlist row — never delete publisher/content/ad records.

## Success criteria (pilot)

- 0 auth bypasses / 0 auth errors on CMS paths  
- 0 duplicate publishers / publisher_sources  
- 0 duplicate articles / links from publish bridge  
- 0 broken layouts / schedule overlap  
- 0 financial side effects  
- Feed not replaced; Smart Feed off in prod  
- Build healthy  

## P11.2 operationalization (R2 + AD_SERVING + Owner UX)

- R2 required env names: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`.
- Media upload uses allowlist `MEDIA_UPLOAD` (globals stay false). Missing R2 → Turkish “Medya yükleme şu anda kullanılamıyor.”
- Studio pages gate via `loadStudioPublisherForPage` (global OR allowlist STUDIO).
- Marketplace tabs / Gelirler nav hidden while P9/P10A dark.
- Smoke: `npx tsx scripts/_phase_p11_2-pilot-smoke.mts`
- Pre-roll may be BLOCKED without R2 without failing other isolation gates; overall GO still requires R2 upload.

## STOP

- Do not enable all users.  
- Do not implement payment.  
- Do not mass-email.  
- Do not create fake engagement.
