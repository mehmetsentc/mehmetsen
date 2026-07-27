# NaHaber Multi-Agent AI Editorial Newsroom V2

## Existing architecture (source of truth)

Canonical publish path:

1. Category crons → `runRssWorker` → Firestore `newsQueue`
2. `/api/cron/newsroom/process-queue` → `processNewsQueue`
3. `processNewsroomArticle` (`src/services/newsroom/pipeline.ts`)
4. `runMultiStageEditor` (DeepSeek writer → heuristic fact-check → category → gate)
5. Confidence / moderation → `news` or `newsDrafts`

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

## V2 extension (this release)

Persona layer on top of existing pipelines — **no third publish orchestrator**.

| Layer | Collection / store |
|-------|-------------------|
| AI editor config | `aiEditors` |
| Versioned prompts | `aiEditorPrompts` |
| Model catalog (no secrets) | `aiModelRegistry` |
| Usage events (skeleton) | `aiUsageEvents` |
| Public profile | `users` with `isAI: true`, `aiEditorId` |

News fields added:

- `aiEditorId` — persona id (stable)
- `articleFormat` — `standard` \| `column` \| `analysis` (default `standard`)
- Author byline fields (`authorId`, `authorUsername`, …) set from persona user when routed

Worker `editorId` / `editorType` unchanged.

## Admin

- `/admin/ai-editors` — list / create / seed
- `/admin/ai-editors/[id]` — constitution, task prompts, models, policy, sandbox
- Sidebar under Yapay Zeka
- Permissions: `editors:manage`, `ai:configure` (operate); `ai:use` (view)

## Seed editors (idempotent)

Selin Aras, Mert Karaca, Defne Aksoy, Kerem Aydın, Ece Yalın, Deniz Erdem, İpek Demir, Arda Şahin.

Default publish policy: **REQUIRES_APPROVAL** → always `newsDrafts` until Admin changes policy.

## Adding a new editor

Admin → AI Editörler → Yeni (or API `POST /api/admin/ai-editors`). Creates `aiEditors` + synthetic `users` doc. Public profile at `/yazar/{slug}` appears automatically.

## Changing models

Edit `modelAssignments` on the editor (Admin UI). Secrets stay in Vercel env (`DEEPSEEK_API_KEY`, `GEMINI_API_KEY`).

## Columns

`articleFormat: 'column'` marks opinion pieces. Not mixed into breaking feeds. Column cron `/api/cron/newsroom/ai-columns` (daily 07:00 UTC) is idempotent and skips when there is nothing worth writing.

## Later phases (not this PR)

Memory retrieval, learning proposals, Editor-in-Chief layer, full cost dashboard, weekly review, homepage “Bugünün Yazarları”, prediction tracking.

## Manual ops

1. Deploy Firestore indexes / rules if changed
2. Run seed once from Admin
3. Confirm env keys already configured
4. Deploy with `[deploy]` after smoke tests
