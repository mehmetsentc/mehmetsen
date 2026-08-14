# NaHaber CMS — AI Newsroom OS Architecture

> Living document. Extends the existing Next.js + Firebase CMS; does **not** replace it.

## 1. Current stack (verified)

| Layer | Reality |
| --- | --- |
| Framework | Next.js 15 App Router, React 19, TypeScript |
| UI | Tailwind + CSS vars (`--color-brand`, `--admin-sidebar`), Lucide |
| Auth | Firebase Auth + Firestore `users.role` → `CmsRole` |
| CMS RBAC | `src/types/cms.ts` — roles + `CmsPermission` (colon form) |
| Primary data | Firestore (`Collections` in `src/lib/firebase/collections.ts`) |
| Secondary SQL | Neon + Drizzle (`provinces`, `districts`, `news`, `media`, …) |
| Newsroom | Workers → `newsQueue` → process-queue → publish (`src/services/newsroom/*`) |
| AI | DeepSeek / Gemini / Meta rewrite paths; `aiEditors`, prompts, usage events |
| Social | `publishOneSocial`, platform adapters, social cron |
| Admin shell | `CMSSidebar`, `CMSHeader`, `AdminGuard`, `AdminCommandPalette`, mobile shell |
| 81 provinces | `src/constants/cities.ts` + Drizzle `provinces` |

## 2. Preserve (do not break)

- Published news documents & public routes
- Existing admin auth (`verifyCmsToken`, `useCmsAuth`, `AdminGuard`)
- News create/edit (`AdminNewsForm` / editor)
- Category constants (`src/constants/config.ts`)
- Newsroom ingest/process cron paths
- Social auto-share + manual admin share
- Visual CMS identity (dark sidebar, brand red, card language)

## 3. Gap map (spec → existing)

| Spec area | Existing | Gap |
| --- | --- | --- |
| Hierarchical AI agents | `aiEditors` personas | Manager/subordinate, territories, autonomy, tools |
| Task bus between agents | Pipeline stages (implicit) | Explicit `agentTasks` with assign/escalation |
| Scoped RBAC | Role→permission matrix | City/category scopes on grants |
| 81 İl CMS | Province constants + city sites | Admin location entity + city ops settings |
| 81 SMM network | Single social publish path | Per-city SMM agents + account vault + matrix |
| Page controls / global layout | Hardcoded UI | Versioned layout docs |
| Algorithm agent | Feed heuristics in app | Proposal + simulation + human approve |
| Learning engine | Editorial sandbox fragments | Diff→proposal→sandbox→deploy loop |
| Fact check claims | `factChecks` collection + engines | Claim-level UI + score gates |
| Audit | Partial logs | Unified `auditLogs` for critical mutations |
| Feature flags | Env-scattered | Central `cmsFeatureFlags` |

## 4. Data strategy

- **Firestore**: operational CMS docs (agents, tasks, layouts, proposals, SMM queue, audit) — denormalized for admin reads.
- **Drizzle/Neon**: location taxonomy & relational news joins already started — extend, don’t duplicate 81 il master list.
- Backwards compatible: new fields optional; old clients ignore them.

## 5. Phased delivery

1. **Foundation** — permissions, scopes, feature flags, types, nav, OS page shells, dashboard hooks
2. **Agent architecture** — Agent model, runtime context, org chart
3. **Workflow/tasks** — explicit pipeline tasks on top of existing queue
4. **Locations** — 81 il admin + city settings
5. **SMM network** — city agents, accounts, queue, matrix
6. **Page / global layout** — versioned blocks
7. **Algorithm agent** — proposals + simulator
8. **Learning + memory** — proposals + TTL memory
9. **Analytics / health / audit** — observability
10. **Hardening** — tests, indexes, rollout flags

## 6. Safety principles

- Server builds agent context; client never supplies permissions.
- Learning never writes production rules without human approval.
- Social publish stays idempotent; tokens stay in vault/integrations.
- New UI modules reuse admin shell tokens — no second design system.
- Incomplete backends expose **adapter empty/error states**, not fake KPIs in production.
