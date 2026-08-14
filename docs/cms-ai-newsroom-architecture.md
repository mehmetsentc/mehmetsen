# NaHaber CMS — AI Newsroom OS Architecture

> Living document. Extends the existing Next.js + Firebase CMS; does **not** replace it.

Inventory cross-checked against codebase explores ([Analyze admin CMS](fa388659-cca7-4bcd-ad93-635fd0e718a9), [Analyze newsroom AI social](602f7f72-7fb2-479b-b6e1-6cab3e5558b1)).

## 1. Current stack (verified)

| Layer | Reality |
| --- | --- |
| App shape | Single Next.js app at `/Users/user/nahaber` (not multi-package); `canakkale.nahaber/` is assets/preview |
| Framework | Next.js 15 App Router, React 19, TypeScript |
| UI | Tailwind + CSS vars (`--color-brand`, `--admin-sidebar`), Lucide; tokens in `src/styles/tokens/admin.css` |
| Auth | Edge `cms_session` + client `AdminGuard` + API `verifyCmsToken` (Bearer) — cookie alone is not enough for mutations |
| CMS RBAC | `src/types/cms.ts` — 6 roles + colon permissions; extended OS perms (`agents:*`, `social:*`, `locations:*`, …) |
| Primary data | Firestore (`Collections` in `src/lib/firebase/collections.ts`) |
| Secondary SQL | Neon + Drizzle (`provinces`, `districts`, `news`, `media`, …) |
| Newsroom | Workers → `newsQueue` → `process-queue` → multi-stage DeepSeek → `news` / `newsDrafts` |
| AI | DeepSeek primary; Gemini (research/social/image); Meta Llama (captions); `aiEditors` personas |
| Social | `publishOneSocial` + cron — **auto-share still Çanakkale-centric** |
| Admin shell | `CMSSidebar`, `CMSHeader`, `AdminGuard`, `AdminCommandPalette`, mobile shell |
| 81 provinces | `src/constants/cities.ts` + `seedCityEditors` + geoEngine |

**Canonical publish path:** category crons → RSS/scraper workers → `newsQueue` → `processNewsroomArticle` → publish/draft.

**Do not revive as second orchestrator:** legacy `aiQueue` stays off unless `AI_QUEUE_PUBLISH_ENABLED=1`.

## 2. Preserve (do not break)

- Published news documents & public routes
- Existing admin auth (`verifyCmsToken`, `useCmsAuth`, `AdminGuard`, `cms-sync`)
- News create/edit (`AdminNewsEditor`)
- Category constants (`src/constants/config.ts`)
- Newsroom ingest/process cron paths
- Social auto-share + manual admin share
- Visual CMS identity (dark sidebar, brand red `#E50914`, card language)
- Existing `aiEditors` V2 personas (byline + prompt overlay)

## 3. Gap map (spec → status)

| Spec area | Status |
| --- | --- |
| Hierarchical AI agents | **Shipped foundation** — `newsroomAgents`, org seed, runtime context API, `/admin/ai-org` |
| Task bus | **Shipped foundation** — `agentTasks` + `/api/admin/agent-tasks` + audit; not yet wired into every pipeline stage |
| Scoped RBAC | **Foundation** — `rbacScope.ts` + extended perms; user-grant UI still thin |
| 81 İl CMS | **Shipped UI** — `/admin/locations` from `TURKISH_PROVINCES`; `cityOpsSettings` TBD |
| 81 SMM network | **Shipped seed/UI** — `/admin/smm` + `seed-smm-81`; publish still uses Çanakkale auto-share path |
| Page controls / global layout | Open (Phase 6) |
| Algorithm agent | Open (Phase 7) — proposals only, no auto-deploy |
| Learning engine | Open (Phase 8) — human approve required |
| Fact check claims | Partial — heuristic/stage2 + optional LLM; claim-level UI/score gates open |
| Audit | Partial — task create/status → `cmsAuditLogs`; expand to publish/role/layout |
| Feature flags | **Shipped** — `featureFlags.ts` + `cmsFeatureFlags` collection key |

## 4. Shipped OS surface (Phase 1–5)

- Nav regrouped to Newsroom OS hierarchy in `CMSSidebar`
- Types: `src/types/newsroomOs.ts`
- Services: `src/services/newsroomOs/{agentService,taskService,orgSeed,adapters}.ts`
- APIs: `/api/admin/newsroom-agents`, `/api/admin/agent-tasks`
- Admin pages: AI Org / Agents / Tasks / Locations / SMM (+ other shells)
- Build fix: notification icon map + `listAgentTasks` export clash (`64942dd`)

## 5. Data strategy

- **Firestore**: agents, tasks, layouts, proposals, SMM queue, audit — denormalized for admin reads
- **Drizzle/Neon**: location taxonomy — do not duplicate 81-il master list
- Backwards compatible: new fields optional

## 6. Remaining phases

6. Page / global layout (versioned blocks)  
7. Algorithm agent (simulate → human apply)  
8. Learning + memory (TTL; no self-mutating production rules)  
9. Analytics / health / full audit  
10. Hardening — indexes, tests, wire task bus into pipeline stages, nationalize SMM publish safely  

## 7. Safety principles

- Server builds agent context; client never supplies permissions.
- Learning never writes production rules without human approval.
- Social publish stays idempotent; tokens stay in vault/integrations.
- New UI reuses admin shell tokens — no second design system.
- Incomplete backends expose adapter empty/error states — not fake production KPIs.
- Keep `newsQueue` as the ingest spine; OS tasks are an overlay, not a fork.
