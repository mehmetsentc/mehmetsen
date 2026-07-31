# NaHaber Multi-Agent AI Editorial Newsroom V2

## Existing architecture (source of truth)

Canonical publish path:

1. Category crons → `runRssWorker` → Firestore `newsQueue`
2. `/api/cron/newsroom/process-queue` → `processNewsQueue`
3. `processNewsroomArticle` (`src/services/newsroom/pipeline.ts`)
4. `runMultiStageEditor` (DeepSeek writer → heuristic fact-check → category → gate)
5. Gate/skor düşükse **1 rewrite retry** → yeniden gate
6. Confidence / moderation → `news` (AUTO) veya `newsDrafts`
7. `/api/cron/newsroom/draft-reprocess` (*/10) → pending drafts yeniden pipeline → geçerse yayın

Env: `NEWSROOM_REWRITE_MAX_RETRIES` (default 1), `NEWSROOM_RETRY_CONFIDENCE_RELAX` (default 10),
`NEWSROOM_DRAFT_REPROCESS_BATCH` (default 8), `NEWSROOM_AUTO_PUBLISH_THRESHOLD` (default 60).

Legacy sync path: `runRssEditor` → same `processNewsroomArticle`.

Optional `aiQueue` (`src/lib/ai/pipeline.ts`) is draft-only and off unless `AI_QUEUE_PUBLISH_ENABLED=1`.

**Important:** pipeline `editorId` / `editorType` are **worker identities** (`breaking-news`, `local-news`, …), not public AI personas.

Public authors live in **`users`** (`/yazar/[username]`). There is no separate `authors` collection.

LLM reality:

| Provider | Role |
|----------|------|
| DeepSeek | Newsroom rewrite / QA (primary) |
| Gemini | liveResearch, imageSeo, ai-assist fallback |
| OpenAI | Moderation |

Incomplete-sentence gate: `src/lib/ai/textCompleteness.ts` (must not regress).

## V2 extension — multi-agent digital newsroom

Persona layer on top of existing pipelines — **no third publish orchestrator**.

| Layer | Collection / store |
|-------|-------------------|
| AI editor config | `aiEditors` |
| Versioned prompts | `aiEditorPrompts` |
| Model catalog (no secrets) | `aiModelRegistry` |
| Usage events (skeleton) | `aiUsageEvents` |
| Public profile | `users` with `isAI: true`, `aiEditorId` |

News fields:

- `aiEditorId` — persona id (stable)
- `articleFormat` — `standard` \| `column` \| `analysis` (default `standard`)
- Author byline fields set from persona user when routed

Worker `editorId` / `editorType` unchanged.

Routing: `src/lib/ai/editorial/editorRouter.ts` + `categoryHint.ts`  
Local discovery queries: `localQueryBuilder.ts`  
Composed prompts: `promptBuilder.ts` (GLOBAL + desk + location context + task)

Personas are **AI editors / AI columnists** — not fake human employees. No fabricated credentials.

## Admin

- `/admin/ai-editors` — list / seed sync / style refresh
- `/admin/ai-editors/[id]` — constitution, task prompts, models, policy, sandbox
- Article editor: default **✨ Otomatik** → `EditorialRouter` assigns specialist
- Permissions: `editors:manage`, `ai:configure` (operate); `ai:use` (view)

## Seed roster (idempotent sync)

Desk editors: Selin, Arda, Ece, Mert, Defne, Kerem, Deniz, Can, Leyla, İpek, Melis, Aslı, Derya, Emre, Zeynep, Baran, Burak, Oğuz  

Internal: Redaksiyon, SEO, Doğrulama  

Columnists: Alp, Derin, Koray, Lara, Eda, Deniz Alp  

`POST /api/admin/ai-editors` `{ action: "seed" }` creates missing + syncs metadata.  
`{ action: "refreshStylePrompts" }` versions prompts from seed.

Default publish policy: **AUTO_PUBLISH** for pipeline personas (quality gates still apply). High-risk human approval remains via gates / CMS.

## CMS auto-routing examples

| Paste | Desk |
|-------|------|
| Çanakkale Biga yangın | Burak Çelik (yerel) |
| Fenerbahçe transfer | Deniz Erdem |
| TCMB faiz | Kerem Aydın |
| Apple iPhone | Can Tunç |
| CHP açıklama | Mert Karaca |

## Adding a new editor

Admin → AI Editörler → Yeni (or API). Creates `aiEditors` + synthetic `users` doc. Prefer `personaType` + `desk` + `categoryIds` over hardcoding names in logic.

## Changing models

Edit `modelAssignments` on the editor (Admin UI). Secrets stay in Vercel env (`DEEPSEEK_API_KEY`).

**Gemini cost control (default OFF):**
- `LIVE_RESEARCH_ENABLED=1` — enables Gemini Google Search grounding
- `GEMINI_VISION_ENABLED=1` — enables Gemini vision for image captions
- Without these flags, newsroom uses DeepSeek only even if `GEMINI_API_KEY` is set.
