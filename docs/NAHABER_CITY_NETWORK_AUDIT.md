# NaHaber City Network — Phase 0 Codebase Audit

> **Date:** 9 August 2026
> **Status:** Current — supersedes the earlier draft (which predated Drizzle/Neon/tenant-middleware work)
> **Purpose:** Comprehensive inventory of the existing codebase before City Network expansion

---

## 1. Tech Stack Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | Next.js (App Router) | `^15.0.0` |
| **Language** | TypeScript | `^5.7.0` |
| **Runtime** | Node.js | `>=20.0.0` |
| **React** | React + React DOM | `^19.0.0` |
| **Primary DB** | Cloud Firestore (Firebase) | firebase `^12.14.0` |
| **Secondary DB** | Neon PostgreSQL (serverless) | `@neondatabase/serverless ^1.1.0` |
| **ORM** | Drizzle ORM | `drizzle-orm ^0.45.2`, `drizzle-kit ^0.31.10` |
| **Auth** | Firebase Auth | via `firebase ^12.14.0` |
| **Storage** | Firebase Storage | via `firebase-admin ^13.10.0` |
| **AI Primary** | DeepSeek V4 Flash | `deepseek-v4-flash` (via OpenAI-compat API) |
| **AI Fallback** | Gemini (shim only — credits depleted) | `GEMINI_API_KEY` |
| **CSS** | Tailwind CSS | `^3.4.0` + `@tailwindcss/typography` |
| **State** | Zustand | `^5.0.0` |
| **Animations** | Framer Motion | `^12.42.0` |
| **Mobile** | Capacitor | `^8.4.1` (iOS + Android) |
| **Push** | OneSignal + Web Push API | `web-push ^3.6.7` |
| **Deploy** | Vercel Pro (Frankfurt `fra1`) | — |
| **Testing** | Vitest | `3.2.4` |
| **Analytics** | Vercel Analytics + Speed Insights | `^1.4.1` / `^1.2.0` |

**Important note on AI providers:** `src/lib/ai/gpt.ts` and `src/lib/ai/gemini.ts` are both shims that re-export DeepSeek functions. The only active AI provider driving the newsroom pipeline is DeepSeek (`deepseek-v4-flash`). OpenAI and Gemini API keys are present in env but not currently used in the rewrite pipeline.

---

## 2. Firebase Collections

All collection names are defined as `const Collections` in `src/lib/firebase/collections.ts`.

### Core Content
| Collection Name | Purpose |
|----------------|---------|
| `news` | Published news articles — the primary feed collection |
| `newsDrafts` | AI-ingested drafts awaiting admin review (`pending_review`, `rejected`, `approved`) |
| `newsArchive` | AI-rewritten RSS backfill, not auto-published to feed |
| `newsQueue` | Processing queue for AI pipeline ingestion |
| `sourceFingerprints` | SHA-256 hash deduplication records (`sourceId:guid`) |
| `posts` | User-created social posts (separate from news) |
| `videos` | Video metadata documents |

### Social / Community
| Collection Name | Purpose |
|----------------|---------|
| `users` | User profiles + roles |
| `comments` | Post/news comments |
| `likes` | Like records |
| `saved` | Saved/bookmarked articles |
| `follows` | Follow relationships |
| `blocks` | User block records |
| `notifications` | In-app notification documents |
| `conversations` | DM conversation roots |
| `messages` | Messages subcollection under `conversations/{id}/messages` |
| `reports` | Content report submissions |

### Events & Categories
| Collection Name | Purpose |
|----------------|---------|
| `categories` | Category definitions |
| `events` | City events (ticketing providers aggregated) |
| `eventReviews` | User reviews of events |

### AI Newsroom
| Collection Name | Purpose |
|----------------|---------|
| `aiQueue` | Multi-agent pipeline processing queue |
| `aiLogs` | AI agent operation logs |
| `scheduledNews` | Scheduled/deferred news items |
| `factChecks` | Fact-check records |
| `duplicates` | Duplicate detection records |
| `socialPosts` | Social media post tracking (FB/IG/Threads/X) |
| `translations` | Multi-language article translations |
| `rssFeeds` | RSS feed source registry |
| `sources` | Ingestion source metadata |

### AI Editorial V2 (Personas)
| Collection Name | Purpose |
|----------------|---------|
| `aiEditors` | Persistent AI editor identity documents (private config) |
| `aiEditorPrompts` | Versioned constitution/task prompts — doc id: `${editorId}__${promptType}__v${n}` |
| `aiModelRegistry` | Provider/model catalog (no API secrets) |
| `aiUsageEvents` | Per-call usage skeleton for cost dashboards |

### Analytics
| Collection Name | Purpose |
|----------------|---------|
| `analyticsDaily` | Daily aggregated page-view counters — doc id: `YYYY-MM-DD` |
| `analyticsVitals` | Per-route Core Web Vitals aggregates |
| `analyticsEvents` | Privacy-safe individual page-view events (TTL: 90 days) |
| `analyticsSessions` | Pseudonymous browsing sessions |
| `analyticsUniques` | One document per visitor/day (exact unique visitor counts) |

### Utilities / Integrations
| Collection Name | Purpose |
|----------------|---------|
| `adBanners` | Ad banner creatives matched by `slotId` |
| `contactSubmissions` | Contact form submissions |
| `newsletterSubscribers` | Email newsletter subscribers — doc id: normalized email |
| `gameScores` | Game leaderboard — doc id: `${gameSlug}__${userId}` |
| `integrations` | OAuth tokens — doc id: `gmail_bilgi`, etc. |

### Sports (Skor)
| Collection Name | Purpose |
|----------------|---------|
| `sportsLeagues` | League definitions |
| `sportsMatches` | Match records |
| `sportsStandings` | League standings |
| `sportsSeasons` | Season metadata |
| `sportsSyncState` | Sync state tracker |

**Total Firestore collections: 50+**

---

## 3. Firebase Storage Usage

Storage initialized in `src/lib/firebase/storage.ts`. Canonical path patterns in `StoragePaths`:

| Path Pattern | Purpose |
|-------------|---------|
| `avatars/{userId}/{fileName}` | User profile photos |
| `posts/{userId}/{postId}/{fileName}` | User post images and videos |
| `events/{eventId}/{fileName}` | Event cover art (admin-uploaded) |
| `events/images/{fileName}` | Shared event imagery (placeholders, category art) |
| `news-images/{userId}/{fileName}` | Legacy path — existing uploads only; new writes use POST_MEDIA |
| `news-videos/{userId}/{fileName}` | Legacy path — existing uploads only |
| `ads/{bannerId}/{fileName}` | Ad banner creatives |

**Storage bucket:** `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` / `FIREBASE_STORAGE_BUCKET`

Image domains whitelisted in `next.config.ts`:
- `firebasestorage.googleapis.com`
- `storage.googleapis.com`
- `lh3.googleusercontent.com` (Google profile photos)
- `www.biletix.com`, `cdn.bubilet.com.tr` (event ticketing)
- Additional news source CDN domains from `src/constants/imageHosts.ts`

---

## 4. Authentication Structure

### Firebase Auth (Primary)
- **Client SDK:** `src/lib/firebase/auth.ts` — exports `auth` instance with `authStateReady()` helper
- **Admin SDK:** `src/lib/firebase/admin.ts` — `getAdminAuth()` for server-side token verification
- **Supported providers:** Google OAuth popup/redirect, Apple Sign-In (native via Capacitor on iOS), email/password
- **Token verification flow:** Firebase ID token → `getAdminAuth().verifyIdToken(token)` in API routes

### CMS Session Layer
- **File:** `src/lib/cmsSession.ts`
- **Mechanism:** Edge-safe HS256 HMAC cookie (`cms_session`, 1-hour TTL) using Web Crypto API
- **Purpose:** Middleware-level guard for `/admin/*` routes (defense in depth only)
- **Secret:** `CMS_SESSION_SECRET` env var
- **Important:** This cookie alone does NOT grant permissions — real authorization is in API routes via Firebase ID token

### CMS Role System (`src/types/cms.ts`)
```
super_admin      (level 100) — locked to SUPER_ADMIN_EMAIL env var
managing_editor  (level 80)
editor           (level 60)
author           (level 40)
video_editor     (level 40)
user             (level 0)
```

CMS staff array: `['super_admin', 'managing_editor', 'editor', 'author', 'video_editor']`

### Auth Sync Flow
1. User logs in via Firebase Auth
2. Client POSTs Firebase ID token to `POST /api/auth/cms-sync`
3. Server verifies token, promotes `SUPER_ADMIN_EMAIL` / bootstrap UIDs, writes/updates Firestore `users/{uid}`, returns `cms_session` cookie
4. Middleware reads `cms_session` cookie on every `/admin/*` request

### Firestore Security Rules (`firestore.rules`)
- `isCmsPublisher()` — admin/super_admin/managing_editor/editor — can CRUD news
- `isCmsStaff()` — adds author + video_editor
- `isNewsEngagementCounterUpdate()` — anyone can increment likes/saves/views/comments
- `isNewsViewCounterUpdate()` — anonymous view count bumps allowed

---

## 5. News Data Model

### `NewsItem` (Feed Display — `src/types/newsItem.ts`)
Lightweight read model mapped from Firestore for homepage/API responses:
```typescript
type NewsItem = {
  id: string; slug: string; title: string; description?: string;
  content?: string; readingMinutes?: number; imageUrl?: string;
  videoUrl?: string; category?: string; source?: string; author?: string;
  url?: string; city?: string; locationCity?: string; province?: string;
  eventDate?: string; createdAt?: string; publishedAt?: string;
  views?: number; likesCount?: number; commentsCount?: number;
  featured?: boolean; featuredAt?: string; breaking?: boolean;
  articleFormat?: 'standard' | 'column' | 'analysis'; seoTitle?: string;
}
```

### `Post` (Full Article — `src/types/post.ts`)
The primary rich content model stored in Firestore `news` collection. Key fields:
- Identity: `id`, `slug`, `title`, `summary`, `feedTeaser`, `content`, `htmlContent`, `bodyBlocks`
- Journalistic: `spot` (Who/What/Where/When/Why lead), `articleLayout`, `articleFormat`
- Author: `authorId`, `authorUsername`, `authorDisplayName`, `authorPhotoURL`, `authorIsAI`
- Geography: `city`, `citySlug`, `districtSlug`, `location` ({city, district?, country, lat, lng})
- Taxonomy: `categoryId`, `tags`, `postType` (news|video|photo|user_post)
- Media: `mediaItems`, `coverImageUrl`, `videoUrl`, `additionalImages`, `imageCaption`
- Status: `status` (draft|pending|published|archived|banned), `visibility`
- Engagement: `likesCount`, `commentsCount`, `viewsCount`, `savesCount`, `sharesCount`
- Editorial flags: `isBreaking`, `featured`, `featuredAt`, `isEditorPick`, `isPinned`, `isTrending`, `priorityScore`
- AI fields: `editorType`, `confidenceScore`, `aiEditorId`, `isDuplicate`, `duplicateReason`
- SEO: `seoTitle`, `seoDescription`, `seoKeywords`, `readingTimeMinutes`
- Social: `twitterCaption`, `instagramCaption`, `whatsappCaption`
- Audio/Video: `videoScript`, `audioUrl`, `audioStoragePath`, `audioReady`
- Live blog: `isLiveBlog`, `liveUpdates`
- Timestamps: `publishedAt`, `createdAt`, `updatedAt`

### `NewsDraftDocument` (Ingestion Draft — `src/types/news.ts`)
Stored in `newsDrafts`. Extends `NewsIngestMeta + NewsLocationFields + NewsroomFields`:
- `draftStatus`: `pending_review | rejected | approved`
- `rssFingerprint`, `rssGuid`, `sourceUrl`, `ingestionSourceId`, `sourceLabel`, `aiGenerated`

### `NewsroomFields` (AI Pipeline Fields — mixed in)
```typescript
{
  editorId?, editorType?, aiEditorId?, articleFormat?,
  confidenceScore?, factCheckFlags?, isBreaking?, priorityScore?,
  breakingScore?, isPinned?, isTrending?, canonicalId?, duplicateOf?,
  needsAdminReview?
}
```

### `NewsArchiveDocument` (`src/types/news.ts`)
Stored in `newsArchive`. Key fields: `fingerprint`, `sourceHash`, `archivedAt`, `status: 'archived'`, `editorId: 'archive'`

### News Status Flow
```
RSS → newsQueue (processing) → newsDrafts (pending_review)
                                    ↓ confidence >= threshold + AUTO_PUBLISH=true
                              news (published)
                                    ↓ archive worker
                              newsArchive
```

---

## 6. Category Model

Defined in `src/constants/config.ts` as `DEFAULT_CATEGORIES: CategoryDef[]`:

```typescript
interface CategoryDef {
  id: string; name: string; slug: string; iconName: string; color: string;
  parentId?: string; standalone?: boolean;
}
```

**Top-level categories:** `trend`, `gundem`, `yerel-haber`, `siyaset`, `dunya`, `kibris-haberleri`, `ekonomi`, `teknoloji`, `saglik`, `bilim`, `egitim`, `cevre-iklim`, `oyun-espor`, `din-inanc`, `magazin`, `spor`, `kultur`, `yasam`, `otomobil`, `gastronomi`, `turizm`, `gezi`, `asayis`, `tarih`, `influencer`

**Subcategories with parentId:**
- `ekonomi`: `borsa` (standalone), `kripto` (standalone), `finans-piyasa`, `emlak-konut`, `enerji`, `is-kariyer`
- `spor`: `futbol` (standalone), `basketbol` (standalone), `voleybol` (standalone), `hentbol`, `atletizm`, `gures`, `dunya-kupasi-2026` (standalone)
- `kultur`: `sinema`, `tiyatro`, `konser`, `festival`
- `yasam`: `astroloji`, `moda`, `anne-cocuk`, `iliskiler`, `nefis-yemek`
- `teknoloji`: `mobil`, `yapay-zeka`, `uzay`, `siber-guvenlik`

**Standalone categories** appear only on their own page — excluded from parent feed queries.

Also mirrored to PostgreSQL `categories` table via `src/db/schema/categories.ts`.

---

## 7. Current Route Structure

### App Router Groups
- `(auth)` — login, register (centered auth layout)
- `(main)` — all public pages (main layout with navbar + sidebar)
- `admin` — CMS panel (protected, desktop sidebar + mobile bottom nav)
- `city-site` — city tenant pages (rewritten from subdomain paths via middleware)
- `api` — all API route handlers
- `dev` — design system showcase (non-production)

### Main Public Routes
| Route | Page |
|-------|------|
| `/` | Homepage (national feed) |
| `/haber/[slug]` | News article detail |
| `/kategori/[id]` | Category feed |
| `/etiket/[slug]` | Tag page |
| `/yazar/[username]` | Author profile |
| `/yerel` | All local news |
| `/yerel/[citySlug]` | City-specific local news |
| `/canli/[slug]` | Live blog |
| `/reels` | TikTok-style video feed |
| `/discover` | Discovery/search |
| `/search` | Search results |
| `/feed` | Social post feed |
| `/events` | Events listing |
| `/skor` | Sports scoreboard |
| `/futbol-canli` | Live football |
| `/weather` | Weather page |
| `/cok-okunanlar` | Most-read |
| `/influencer` | Influencer content |
| `/muzeler` | Museums |
| `/oyunlar` / `/oyunlar/[slug]` | Games |
| `/post/[id]` | Community post detail |
| `/post/create` | Create community post |
| `/profile/[username]` | User profile |
| `/messages` / `/messages/[conversationId]` | Direct messages |
| `/notifications` | Notifications |
| `/saved` | Saved articles |
| `/settings/*` | 8 sub-routes: profile, appearance, notifications, privacy, help, about, terms, account/delete |
| `/onboarding` | Onboarding flow |
| `/uygulama` | App download page |

### City Site Routes (middleware-rewritten)
| Public URL | Internal Path | Page |
|-----------|---------------|------|
| `[city].nahaber.com/` | `/city-site` | City main feed |
| `[city].nahaber.com/etkinlik` | `/city-site/etkinlik` | City events |
| `[city].nahaber.com/spor` | `/city-site/spor` | City sports |
| `[city].nahaber.com/ilceler` | `/city-site/ilceler` | District list |

Non-rewritten paths (`/haber/[slug]`, `/search`, etc.) on city subdomains fall through to national routes.

### Feed / Sitemap Routes
`/rss.xml`, `/rss/[category]`, `/news-sitemap.xml`, `/images-sitemap.xml`, `/video-sitemap.xml`, `/sitemap.xml`, `/sitemap/[id]`, `/breaking-news.xml`, `/video-feed.xml`, `/robots.ts`

---

## 8. API Routes Inventory

**Total: 180+ route handlers**

### Feed APIs
- `GET /api/feed/home` — homepage feed
- `GET /api/feed/more` — paginated feed (2 min CDN cache)
- `GET /api/feed/category` — category feed
- `GET /api/feed/category-rails` — lazy category rail sections (2 min CDN cache)
- `GET /api/news/top` — most-read (2 min CDN cache)
- `GET /api/news/on-this-day` — "on this day" news
- `POST /api/news/view` — view counter increment
- `GET /api/city/news` — city-scoped news feed (2 min CDN cache, `?city=canakkale&category=...`)
- `GET /api/search` — full-text search

### Auth APIs
- `POST /api/auth/cms-sync` — Firebase ID token → CMS session cookie + role sync
- `POST /api/auth/cms-logout` — clear CMS session

### Admin APIs (all require CMS session + Firebase ID token)
- `/api/admin/news` — news CRUD list
- `/api/admin/news/[id]` — single news CRUD
- `/api/admin/news/[id]/approve` — publish from draft
- `/api/admin/news/ai-image-seo` / `ai-image-placement` — AI image tooling
- `/api/admin/news-drafts/[id]/approve|reject` / `bulk-approve` — draft workflow
- `/api/admin/news-queue/[id]/approve|reject` — queue workflow
- `/api/admin/newsroom/flush-pending|purge-queue|requeue-skipped` — newsroom operations
- `/api/admin/ai-editors` / `/api/admin/ai-editors/[id]` — AI editor persona CRUD
- `/api/admin/ai-assist` / `ai-video-script` — AI content tools
- `/api/admin/social/*` — auto-share, category-rules, diagnose, force-reshare, token management
- `/api/admin/gmail/*` — Gmail OAuth (connect, callback, messages, to-draft, status, disconnect)
- `/api/admin/ads` / `/api/admin/ads/[id]` — ad banner management
- `/api/admin/analytics` — analytics data
- `/api/admin/cron/runs|trigger` — cron monitoring + manual trigger
- `/api/admin/media/import|scrape-video` — media import tools
- `/api/admin/migrate/*` — data migration endpoints (backfill-published-at, fix-timestamps, post-worldcup, restore-events, worldcup)
- `/api/admin/recategorize` — bulk recategorization
- `/api/admin/seo-backfill` — SEO field backfill
- `/api/admin/editorial-review/batch` — editorial quality review
- `/api/admin/backfill-breaking` / `backfill-images` — data backfill
- `/api/admin/bootstrap` — initial system bootstrap
- `/api/admin/queue/purge` / `purge-dead-videos` — cleanup tools

### AI Pipeline APIs
- `POST /api/ai/pipeline` — trigger AI processing pipeline
- `GET /api/ai/queue` — queue status
- `GET /api/ai/status` — pipeline status
- `GET /api/ai/logs` — AI operation logs

### Cron APIs
51 cron-triggered routes — see Section 10 for full schedule.

### External / Utility APIs
- `/api/weather` — Open-Meteo weather (10 min cache)
- `/api/finance/rates` — currency rates (60s cache)
- `/api/finance/bist` — Istanbul Stock Exchange
- `/api/events/sync|aggregate|image` — event data
- `/api/sports/matches|scoreboard|transfermarkt` — sports data
- `/api/football/fixtures|squad|standings` — football data
- `/api/skor/board|archive|standings` — Skor data
- `/api/push/subscribe|unsubscribe|send` — push notifications
- `/api/og` / `/api/og/social/[id]` / `/api/og/story/[id]` — OG image generation (24h CDN cache)
- `/api/rss` — RSS output feed
- `/api/contact` — contact form
- `/api/moderate` — content moderation
- `/api/health` — health check
- `/api/geo/detect|ip` — geolocation
- `/api/analytics/track|vitals` — analytics ingestion
- `/api/account/delete` — account deletion
- `/api/user/improve-text|accept-terms` — user utilities
- `/api/newsletter/subscribe` — email subscription
- `/api/notifications/send` — push notification send
- `/api/revalidate/home` — Next.js cache revalidation
- `/api/eczane` — pharmacy data (AFAD integration)
- `/api/museums` / `/api/museums/cities` — museum data
- `/api/games/scores` — game scores
- `/api/blocks` / `/api/reports` — content moderation
- `/api/authors/[slug]/articles` — author article list
- `/api/share-target` — PWA Web Share Target
- `/api/debug/cron-errors|feed-pool` — debugging

---

## 9. Middleware Behavior

**File:** `middleware.ts` (project root)

### Matcher
```
['/((?!api|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)']
```
Pages only — API routes and static assets are excluded (saves Edge invocations on Vercel Pro).

### Execution Order

1. **Admin guard** — `/admin/*`: reads `cms_session` cookie → `verifyCmsSessionToken()` → if invalid/missing role, redirect to `/login?next={pathname}`

2. **City Network tenant resolution** — `resolveTenantFromRequest()`:
   - Gated by `CITY_NETWORK_ENABLED === 'true'`
   - Reads hostname → `extractCitySubdomain()` → DB lookup (`city_sites` WHERE `slug=$sub AND is_active=true`) → hardcoded fallback
   - If tenant found + path in `CITY_REWRITE_PATHS` (`/`, `/etkinlik`, `/spor`, `/ilceler`): rewrites to `/city-site/*`
   - Sets `x-nahaber-tenant` + `x-nahaber-province` request headers (read by server components)
   - Sets `nahaber_tenant` cookie (1 year, lax)

3. **Country/language cookie** — reads `x-vercel-ip-country` / `cf-ipcountry` header → sets `country` and `lang` cookies only when missing/stale (critical: avoids flipping Vercel CDN from public to private cache)

### Tenant Resolution Logic (`src/lib/tenant.ts`)
```
hostname → extractCitySubdomain()
  → resolveTenantFromDb(): SELECT FROM city_sites WHERE slug=$sub AND is_active=true
  → HARDCODED_TENANTS fallback (currently: { canakkale: { domain: 'canakkale.nahaber.com', provinceSlug: 'canakkale' } })
  → null (national site, no tenant)
Dev fallback: ?tenant=canakkale query param
```

### Key Design Decision
Middleware does NOT set cookies on every request — only when missing or stale. This keeps `Cache-Control: public` effective for the Vercel CDN edge cache.

---

## 10. Cron Jobs

**Total: 51 cron jobs** (from `vercel.json`)

### Every 15-20 Minutes (Near-Real-Time)
| Path | Schedule | Purpose |
|------|----------|---------|
| `/api/cron/newsroom/afad` | `*/15 * * * *` | AFAD emergency alerts |
| `/api/cron/newsroom/process-queue` | `*/15 * * * *` | AI queue processor |
| `/api/cron/newsroom/breaking` | `*/20 * * * *` | Breaking news ingest |

### Every 30 Minutes
`/api/cron/newsroom/gundem`, `/api/cron/newsroom/sports`, `/api/cron/newsroom/anka-breaking`

### Hourly
`/api/cron/newsroom/ai-pipeline` (at :10 and :40), `/api/cron/newsroom/local`, `/api/cron/newsroom/national`, `/api/cron/newsroom/finans`, `/api/cron/newsroom/politics`, `/api/cron/newsroom/aa-content` (:40), `/api/cron/newsroom/queue-purge` (:20), `/api/cron/newsroom/sozcu-breaking`, `/api/cron/newsroom/expire-breaking`, `/api/cron/newsroom/freenews`, `/api/cron/newsroom/kibris`, `/api/cron/newsroom/futbol` (:05), `/api/cron/newsroom/world` (:05), `/api/cron/newsroom/technology` (:10), `/api/cron/newsroom/kripto` (:20), `/api/cron/newsroom/health` (:35), `/api/cron/youtube-rss`

### Every 2-4 Hours
`/api/cron/newsroom/entertainment`, `/api/cron/newsroom/magazine`, `/api/cron/newsroom/gastronomi`, `/api/cron/newsroom/otomobil`, `/api/cron/newsroom/trend`, `/api/cron/newsroom/video-process`, `/api/cron/newsroom/bilim-teknoloji`, `/api/cron/newsroom/saglik-sozcu`, `/api/cron/newsroom/weather`, `/api/cron/newsroom/voleybol`, `/api/cron/newsroom/basketbol`, `/api/cron/newsroom/borsa`, `/api/cron/weather-news`, `/api/cron/skor-live` (17-22h evenings)

### Every 6-8 Hours
`/api/cron/newsroom/influencer`, `/api/cron/newsroom/video-queue`, `/api/cron/newsroom/draft-reprocess`, `/api/cron/newsroom/anka-local` (:00 at 3,13,15,21h), `/api/cron/editorial-review`, `/api/cron/social` (8,12,18,22h)

### Daily
`/api/cron/newsroom/ai-columns` (7am), `/api/cron/newsroom/seo` (4am), `/api/cron/newsroom/archive` (2am), `/api/cron/newsroom/thin-content-backfill` (2am+2pm), `/api/cron/on-this-day` (midnight), `/api/cron/football-sync` (6am), `/api/cron/skor-daily` (5:15am), `/api/events/sync` (9pm)

### Weekly
`/api/cron/skor-standings` (Monday 5:30am)

**Memory:** Key compute-heavy functions (breaking, ai-pipeline, ai-columns, local, national, archive, thin-content-backfill, draft-reprocess, video-process, process-queue, backfill ops) have 1024 MB Vercel function memory.

---

## 11. Existing Services Architecture

### `src/services/` (top-level)
| File | Purpose |
|------|---------|
| `adminNewsService.ts` | CMS news CRUD (client-side, uses Firebase Auth token) |
| `adminService.ts` | General admin operations |
| `adminArchiveService.ts` | Archive management |
| `aiNewsEditor.ts` | AI editor interface (imports from newsroom) |
| `authService.ts` | Firebase Auth service wrapper |
| `cityNewsService.server.ts` | City-scoped Firestore queries (server-only, `unstable_cache` 120s) |
| `commentService.ts` | Comment CRUD |
| `eventService.ts` / `eventService.server.ts` | Event data |
| `eventAggregatorService.ts` | Multi-provider event aggregation (Biletix, Biletino, Bubilet) |
| `followService.ts` | Follow/unfollow |
| `footballService.server.ts` | Football data |
| `gmailService.ts` | Gmail OAuth integration (editorial inbox) |
| `likeService.ts` | Like/unlike |
| `messageService.ts` | DM messages |
| `moderationService.ts` | Content moderation |
| `museumService.server.ts` | Museum data |
| `newsDraftService.ts` | Draft queue operations |
| `newsService.server.ts` | Published news queries (server-side) |
| `newsSyncService.ts` | RSS→Firestore sync |
| `notificationService.ts` | Push notification management |
| `postService.ts` | Social post CRUD |
| `reportService.ts` | Content reports |
| `saveService.ts` | Save/bookmark |
| `searchService.ts` | Search |
| `storageService.ts` | Firebase Storage upload operations |
| `trendingService.ts` | Trending calculation |
| `userService.ts` / `userService.server.ts` | User profile management |

### `src/services/newsroom/` (AI Newsroom Pipeline)
Autonomous multi-editor news pipeline:

| Component | Purpose |
|-----------|---------|
| `pipeline.ts` | Core orchestrator — RSS → extract → AI rewrite → fact-check → dedupe → category/geo → publish/draft |
| `config.ts` | Pipeline config (AUTO_PUBLISH_ENABLED, thresholds, source ID arrays) |
| `types.ts` | 50 `EditorId` values, `NewsroomArticleInput`, `EditorMetadata` |
| `geoEngine.ts` | Extract city/district from article text — all 81 Turkish provinces + 973 districts |
| `categoryEngine.ts` | Normalize AI category, apply editor type overrides, `CATEGORY_ALIASES` map |
| `breakingPriority.ts` | Breaking score (0-100), push notification gating, urgency keyword detection |
| `factChecker.ts` | Confidence score calculation |
| `ingestRunner.ts` | RSS batch ingestion runner |
| `draftReprocessService.ts` | Retry failed/low-confidence drafts |
| `seoMaintenanceWorker.ts` | SEO field backfill |
| `thinContentBackfillWorker.ts` | Enrich short articles |
| `scraperPublishHelper.ts` | Scraper-sourced article helpers |
| `editors/multiStageEditor.ts` | 4-stage pipeline orchestration |
| `editors/stage1_contentWriter.ts` | AI rewrite stage |
| `editors/stage2_factChecker.ts` | Fact-check stage |
| `editors/stage3_categoryEditor.ts` | Category/geo assignment |
| `editors/stage4_gateKeeper.ts` | Publish/draft decision |
| `queue/newsQueueService.ts` | Queue management |
| `queue/queueProcessor.ts` | Queue item processing |
| `dedupe/similarityEngine.ts` | Cosine/Levenshtein similarity deduplication |
| `detection/sourceFingerprint.ts` | SHA-256 fingerprint generation |
| `detection/changeDetector.ts` | RSS change detection |

**Active AI providers in pipeline:**
- Primary: DeepSeek (`deepseek-v4-flash`) via `src/lib/ai/deepseek.ts`
- `src/lib/ai/gemini.ts` — shim only, routes to DeepSeek (credits depleted)
- `src/lib/ai/gpt.ts` — shim only, routes to DeepSeek

### `src/services/rss/`
| File | Purpose |
|------|---------|
| `sources.ts` | Full RSS source registry (~40 sources; enabled subset specified in `config.ts`) |
| `rssFetcher.ts` | RSS fetch + parse (supports `rss` and `trt-xml` formats) |
| `articleFetcher.ts` | Full article extraction for thin RSS content |
| `enrichedArticleFetcher.ts` | Enriched fetching with Jina AI bypass for blocked sites |
| `batchSources.ts` | Batch source processing |

### `src/lib/ai/editorial/` (AI Editorial V2)
| File | Purpose |
|------|---------|
| `modelRouter.ts` | Resolves provider/model per editor+task; records usage to `aiUsageEvents` collection |
| `editorRouter.ts` | Routes articles to appropriate AI editors |
| `promptBuilder.ts` | Builds editor-specific prompts |
| `aiEditorService.ts` | Firestore CRUD for `aiEditors` / `aiEditorPrompts` |
| `localQueryBuilder.ts` | Builds city-specific queries for local editors |
| `categoryHint.ts` | Fast pre-classification for CMS auto-routing |
| `columnGenerator.ts` | AI opinion column generation |

---

## 12. Environment Variables Used

### `NEXT_PUBLIC_` (exposed to browser)
| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase client config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | FCM sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase app ID |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Google Analytics measurement ID |
| `NEXT_PUBLIC_APP_URL` | Canonical URL (`https://www.nahaber.com`) |
| `NEXT_PUBLIC_APP_NAME` | Site display name |
| `NEXT_PUBLIC_ADMIN_UIDS` | Bootstrap admin UIDs (comma-separated) |
| `NEXT_PUBLIC_ONESIGNAL_APP_ID` | OneSignal app ID for push notifications |

### Server-only
| Variable | Purpose |
|----------|---------|
| `FIREBASE_ADMIN_PROJECT_ID` | Firebase Admin SDK |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Firebase Admin SDK |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Firebase Admin SDK |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Alternative: full service account JSON |
| `FIREBASE_STORAGE_BUCKET` | Server-side storage bucket override |
| `CRON_SECRET` | Vercel cron job authentication |
| `EVENTS_SYNC_SECRET` | Event sync authentication |
| `CMS_SESSION_SECRET` | HS256 HMAC key for `cms_session` cookie |
| `SUPER_ADMIN_EMAIL` | Locked super admin email |
| `DATABASE_URL` | Neon PostgreSQL connection string (pooled, HTTP driver) |
| `DATABASE_URL_UNPOOLED` | Neon direct connection (for migrations) |
| `CITY_NETWORK_ENABLED` | `'true'` enables tenant resolution in middleware |
| `POSTGRES_READS_ENABLED` | `'true'` enables Postgres read path (currently unused) |
| `OPENAI_API_KEY` | OpenAI key (currently unused in pipeline; present for legacy) |
| `OPENAI_NEWS_MODEL` / `OPENAI_QA_MODEL` | Model overrides |
| `DEEPSEEK_API_KEY` | Primary AI provider |
| `DEEPSEEK_NEWS_MODEL` | Model override (default: `deepseek-v4-flash`) |
| `GEMINI_API_KEY` | Gemini key (fallback, credits depleted) |
| `GEMINI_MODEL` | Model override |
| `ANTHROPIC_API_KEY` | Present in env; no active usage found in codebase |
| `SERPER_API_KEY` | Search/grounding API |
| `RAPIDAPI_KEY` / `RAPIDAPI_HOST` | RapidAPI services |
| `JINA_API_KEY` | Jina AI for scraper bypass on blocked sites |
| `WEATHER_API_KEY` | Weather API |
| `TICKETMASTER_API_KEY` | Ticketmaster events |
| `ONESIGNAL_APP_ID` / `ONESIGNAL_REST_API_KEY` | OneSignal push |
| `THREADS_USER_ID` / `THREADS_ACCESS_TOKEN` | Threads/Meta API |
| `FACEBOOK_APP_ID` / `FACEBOOK_PAGE_ACCESS_TOKEN` / `FACEBOOK_PAGE_ID` / `FACEBOOK_APP_SECRET` | Facebook API |
| `INSTAGRAM_ACCESS_TOKEN` / `INSTAGRAM_BUSINESS_ID` | Instagram API |
| `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | Twitter/X API |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REDIRECT_URI` / `GMAIL_MAILBOX` / `GMAIL_TOKEN_ENCRYPTION_KEY` | Gmail integration |
| `NEWSROOM_AUTO_PUBLISH_ENABLED` | `'1'` or `'true'` to enable auto-publish (default: off) |
| `NEWSROOM_AUTO_PUBLISH_THRESHOLD` | Confidence score for auto-publish (default: 70) |
| `NEWSROOM_LOW_CONFIDENCE_THRESHOLD` | Flag for admin review (default: 55) |
| `NEWSROOM_REWRITE_MAX_RETRIES` | Max AI rewrite attempts (default: 2, max: 3) |
| `NEWSROOM_DRAFT_REPROCESS_BATCH` | Drafts reprocessed per cron (default: 8) |
| `LOCAL_NEWS_MAX_PROVINCES` | Max provinces scanned per local news cron run (default: 40) |

---

## 13. Admin Panel Capabilities

Located at `/admin/*` — protected by `AdminGuard` component + middleware CMS session.

### Admin Pages
| Route | Capability |
|-------|-----------|
| `/admin/dashboard` | Site statistics, quick actions |
| `/admin/news` | News list: filter by status/source/category, bulk actions |
| `/admin/news/create` | Create news article |
| `/admin/news/[id]/edit` | Edit published/draft article |
| `/admin/newsroom` | AI pipeline monitoring |
| `/admin/approvals` | Draft approval queue (`pending_review`) |
| `/admin/approvals/[id]` | Single draft review with approve/reject |
| `/admin/categories` | Category management |
| `/admin/users` | User management, role assignment |
| `/admin/authors` | Author profiles |
| `/admin/editors` | Human editor management |
| `/admin/ai-editors` | AI editor persona management |
| `/admin/ai-editors/[id]` | Single AI editor config (model assignments, provinces, prompts) |
| `/admin/ai/news` | AI news generation tools |
| `/admin/ai/video` | AI video script tools |
| `/admin/videos` | Video management |
| `/admin/events` | Event management |
| `/admin/archive` | Archived news browser |
| `/admin/submissions` | User-submitted content |
| `/admin/inbox` | Gmail-integrated editorial inbox |
| `/admin/social` | Social media management (FB/IG/Threads/X) |
| `/admin/social/gorsel` | Social image creation |
| `/admin/ads` | Ad banner management |
| `/admin/seo` | SEO tools and backfill |
| `/admin/cron` | Cron job monitoring and manual triggers |
| `/admin/api-management` | API key management |
| `/admin/analytics` | Site analytics dashboard |
| `/admin/settings` | System settings |
| `/admin/reports` | User-reported content review |
| `/admin/menu` | Navigation menu management |
| `/admin/quick` | Quick actions panel |
| `/admin/posts` | User post management |

### Admin Layout
Fully responsive: desktop sidebar (`CMSSidebar`) + mobile bottom nav (`MobileAdminBottomNav`) + slide-out sheets (create, search, notifications). Uses `MobileAdminProvider` context for mobile state.

---

## 14. AI Editor / Newsroom Pipeline

### Architecture Overview
Multi-stage autonomous pipeline triggered by cron jobs:

```
Cron → rssFetcher → articleFetcher (enrichment for thin content) → pipeline.ts
                                                                       ↓
                                                       Stage 1: ContentWriter (AI rewrite)
                                                       Stage 2: FactChecker (0-100 score)
                                                       Stage 3: CategoryEditor + GeoEngine
                                                       Stage 4: GateKeeper (decision)
                                                                       ↓
                                           confidence >= threshold → news (published)
                                           confidence < threshold  → newsDrafts (pending_review)
                                           DRAFT_ONLY persona     → always newsDrafts
```

### Promotional Content Filter
Before pipeline: `isPromotionalContent()` detects and drops RSS items that are social media promo posts (WhatsApp channel links, Telegram links, Bluesky invites, etc.) — common in ANKA/AA feeds.

### Configuration
- `NEWSROOM_AUTO_PUBLISH_ENABLED` — master switch (off by default)
- `NEWSROOM_AUTO_PUBLISH_THRESHOLD` — confidence score for auto-publish (default: 70)
- `NEWSROOM_LOW_CONFIDENCE_THRESHOLD` — flag for admin review (default: 55)
- Retry logic: up to `NEWSROOM_REWRITE_MAX_RETRIES` attempts, relaxing confidence by `NEWSROOM_RETRY_CONFIDENCE_RELAX` per retry

### AI Editor Personas (V2)
Persistent AI identities in `aiEditors` Firestore collection:
- `AiEditorDocument` — full persona config (role type, capabilities, model assignments per task, local config with province/district focus)
- `AiEditorPrompts` — versioned prompt constitutions (`${editorId}__${promptType}__v${n}`)
- `AiPublishPolicy`: `DRAFT_ONLY | REQUIRES_APPROVAL | AUTO_PUBLISH` — overrides global setting
- `AiEditorLocalConfig.provinces` — array of province slugs for city desk editors

### Active RSS Source IDs (Enabled, as of 2026-08-02)
- **National:** `aa`, `dha`, `anka-haber`, `trt`, `ntv`, `cnn`, `haberturk`, `sozcu`, `ensonhaber`, `yeniasir`, `dw-turkish`, `cumhuriyet`, `t24`
- **Breaking:** `aa`, `dha`, `anka-haber`, `ntv`, `cnn`, `haberturk`, `trt`, `sabah`, `sabah-sondakika`, `milliyet-sondakika`, `reuters-world`, `ap-news`
- **World:** `reuters-world`, `ap-news`, `aljazeera`, `bbc-world`, `euronews-tr`, `dw-turkish`, `milliyet-dunya`, `sabah-dunya`
- **Disabled:** `iha`, `hurriyet`, `ahaber`, `yeniakit`, `haberler`, `sondakika`, `mynet`, `bbc` (stale since April 2026)

---

## 15. Current Media / Image Handling

### Upload Flow
1. Client calls `storageService.ts` → `uploadBytesResumable()` to Firebase Storage with progress callback
2. `getDownloadURL()` returns public URL → persisted in Firestore document field
3. Next.js `<Image>` component with `remotePatterns` in `next.config.ts` handles display

### Image Optimization (next.config.ts)
- Cache TTL: 7 days minimum
- Formats: AVIF + WebP
- Device sizes: 640, 750, 828, 1080, 1200
- Image sizes: 16, 32, 48, 64, 96, 128, 256

### OG Images
Generated server-side via `/api/og`, `/api/og/social/[id]`, `/api/og/story/[id]` — 24h CDN cache.

### Video
- URLs stored in `news.videoUrl` — YouTube embeds or Firebase Storage paths
- TikTok-style feed at `/reels` queries `news` collection where `videoUrl != ''`
- Video cron pipeline: `video-queue` (every 6h) → `video-process` (every 3h)
- AI video scripts: `videoScript`, `videoScript30s`, `videoScript90s` fields on articles

### Firebase Storage Rules
`storage.rules` — avatars, post media, events only writable by authenticated owners. Admin SDK bypasses rules for server-side operations.

---

## 16. City Network Readiness

### What Already Exists (Implemented)
| Feature | Location |
|---------|----------|
| Middleware tenant resolution (hostname → DB → hardcoded) | `middleware.ts` + `src/lib/tenant.ts` |
| City site App Router pages (4 routes) | `src/app/city-site/` |
| City news Firestore service (with `unstable_cache`) | `src/services/cityNewsService.server.ts` |
| City news API endpoint | `src/app/api/city/news/route.ts` |
| Tenant context server helpers | `src/lib/tenantContext.ts` |
| `city_sites` Postgres table schema | `src/db/schema/citySites.ts` |
| DB-backed tenant resolution with fallback | `src/lib/tenant.ts` → `resolveTenantFromDb()` |
| Feature flag gating (`CITY_NETWORK_ENABLED`) | `src/db/index.ts` + middleware |
| Drizzle ORM + Neon serverless driver installed | `package.json`, `src/db/index.ts` |
| Full Postgres schema (10 tables) | `src/db/schema/` |
| Seed script (Çanakkale + all categories) | `src/db/seed.ts` |
| `citySlug` field on all Firestore news docs | All newsroom workers set this field |
| All 81 Turkish provinces with lat/lng | `src/constants/cities.ts` |
| 973 Turkish districts | `src/constants/turkishDistricts.ts` |
| GeoEngine — city/district extraction from text | `src/services/newsroom/geoEngine.ts` |
| City-aware RSS local cron | `src/app/api/cron/newsroom/local/route.ts` |
| `CityLayoutClient` + `CityFeedClient` components | `src/components/city/` |
| Hardcoded Çanakkale tenant fallback | `src/lib/tenant.ts` — `HARDCODED_TENANTS` |
| `x-nahaber-tenant` / `x-nahaber-province` headers | Set by middleware, read by `tenantContext.ts` |
| `nahaber_tenant` cookie | Set by middleware |
| City-scoped `yerel/[citySlug]` page | `src/app/(main)/yerel/[citySlug]/page.tsx` |

### What is Still Missing / Incomplete
| Feature | Gap | Priority |
|---------|-----|----------|
| Postgres migrations | `src/db/migrations/` is empty — schema not applied to Neon DB | CRITICAL |
| `isActive = false` in seed | Çanakkale row seeded with `isActive: false` — tenant won't resolve from DB | CRITICAL |
| `CITY_NETWORK_ENABLED` in production | Flag is not set to `true` in production env | HIGH |
| Postgres read path for news | `POSTGRES_READS_ENABLED` flag exists but no route reads from Postgres | HIGH |
| News pipeline tenant routing | Pipeline writes to national `news` collection — no `city_site_id` set | HIGH |
| City events page | `/city-site/etkinlik` is a stub — no event data filtering by city tenant | MEDIUM |
| City sports page | `/city-site/spor` is a stub — minimal content | MEDIUM |
| District page content | `/city-site/ilceler` is a stub | MEDIUM |
| City-specific AI editors | `localQueryBuilder.ts` + `AiEditorLocalConfig.provinces` exist but no city editors configured | MEDIUM |
| Vercel wildcard domain | Only `canakkale.nahaber.com` can be added — `*.nahaber.com` wildcard requires manual Vercel config | MEDIUM |
| Multi-city seed data | Only Çanakkale seeded — other cities need rows in `city_sites` | LOW |
| City-specific ad slots | `adBanners` is national-only — no `city_site_id` field on banners | LOW |
| City SEO/OG metadata fully wired | City subdomain OG tags partially implemented | LOW |

---

## 17. Migration Risks (Ordered by Severity)

| Risk | Severity | Detail |
|------|----------|--------|
| **URL / slug stability** | CRITICAL | `/haber/[slug]` is indexed by Google News. Slug changes = permanent traffic loss. Never rename slugs. |
| **Postgres schema not applied** | CRITICAL | `src/db/migrations/` is empty. Must run `drizzle-kit generate` + `migrate` before any Postgres reads can work. |
| **Çanakkale `isActive=false`** | CRITICAL | Seed sets `isActive: false`. DB tenant lookup returns null until this is flipped. |
| **51 cron job interruption** | HIGH | Crons write to Firestore continuously. Any dual-write phase failure breaks the news pipeline. |
| **Firestore real-time listeners** | HIGH | Client-side `onSnapshot` calls in feeds, notifications, DMs. Postgres read path must be transparently swapped. |
| **Storage URL hardcoding** | HIGH | `firebasestorage.googleapis.com` URLs stored in millions of Firestore docs. CDN/URL migration requires mass backfill. |
| **RSS fingerprint integrity** | HIGH | `sourceFingerprints` prevents duplicate flood. Any migration gap or data loss triggers duplicate articles. |
| **AI pipeline stability** | HIGH | 50 EditorId types, 4-stage pipeline, 51 triggers. Any disruption = visible news gap for readers. |
| **Firebase Auth coupling** | MEDIUM | Token verification wired through Admin SDK everywhere. Cannot be changed in isolation from the pipeline. |
| **Analytics continuity** | MEDIUM | Firestore `analyticsDaily/Events/Sessions/Uniques` are the reporting source of truth. Gap during migration = incorrect dashboards. |
| **Capacitor native app** | MEDIUM | iOS/Android app uses same API. Breaking API changes require coordinated app release and App Store review cycle. |
| **CSP for new domains** | MEDIUM | `next.config.ts` CSP is tightly scoped. `*.nahaber.com` subdomains may need explicit `connect-src` / `frame-src` additions. |
| **AdSense / ad slot revenue** | LOW | `adBanners` collection with slot IDs. City sites may need city-specific ad slots to avoid incorrect ads. |
| **PWA service worker** | LOW | Installed PWA users won't pick up routing changes until service worker update cycle. |

---

## 18. Files That Will Need Modification for City Network

### Immediate / Phase 1 (DB setup)
| File | Change Needed |
|------|--------------|
| `src/db/seed.ts` | Set Çanakkale `isActive: true`; add more cities |
| `src/db/schema/citySites.ts` | Possibly add `timezone`, `mainLanguage` |
| Run `drizzle-kit generate` | Generate SQL migration files (currently none exist) |
| Run `drizzle-kit migrate` | Apply generated migrations to Neon |

### Phase 2 (Activate City Network)
| File | Change Needed |
|------|--------------|
| Vercel env | Set `CITY_NETWORK_ENABLED=true` |
| Vercel dashboard | Add `canakkale.nahaber.com` (and wildcard `*.nahaber.com`) domains |
| `vercel.json` | Document city domain routing (if not using wildcard) |

### Phase 3 (AI Pipeline tenant routing)
| File | Change Needed |
|------|--------------|
| `src/services/newsroom/pipeline.ts` | Write `city_site_id` to Postgres `news` table alongside Firestore |
| `src/services/newsroom/geoEngine.ts` | Route city-detected articles to correct `city_site_id` |
| `src/app/api/cron/newsroom/local/route.ts` | Multi-tenant local ingest with city_site_id |

### Phase 4 (Postgres read path)
| File | Change Needed |
|------|--------------|
| `src/services/newsService.server.ts` | Add Postgres read path behind `POSTGRES_READS_ENABLED` |
| `src/services/cityNewsService.server.ts` | Option to read from Postgres `news` table |
| `src/app/api/feed/more/route.ts` | Postgres pagination |
| `src/app/api/feed/home/route.ts` | Postgres home feed |

### Phase 5 (City UX completion)
| File | Change Needed |
|------|--------------|
| `src/app/city-site/etkinlik/page.tsx` | Wire up city event data |
| `src/app/city-site/spor/page.tsx` | Wire up city sports data |
| `src/app/city-site/ilceler/page.tsx` | District listing with real content |
| `src/components/city/CityFeedClient.tsx` | Pagination, category rails |

### Phase 6 (City SEO)
| File | Change Needed |
|------|--------------|
| `src/lib/seo.ts` | City-aware canonical URLs and OG tags |
| `src/app/city-site/layout.tsx` | Per-city metadata generation |
| `src/app/news-sitemap.xml/route.ts` | City-scoped sitemap entries |
| `next.config.ts` | Add `*.nahaber.com` to CSP `connect-src` if needed |

---

## 19. Features That Must Remain Untouched

| Feature | Reason |
|---------|--------|
| `/haber/[slug]` URL pattern | Google News indexed, permanent SEO value |
| Firebase Auth (Google + Apple Sign-In) | App Store approved; user sessions and push tokens here |
| RSS fingerprint deduplication (`sourceFingerprints`) | Data integrity — removing causes duplicate article flood |
| CMS role/permission system (`src/types/cms.ts`) | Stable, tested, admin-audited |
| Capacitor native layer | App Store build — changes require re-submission and review |
| `vercel.json` cron schedules | News pipeline continuity — any downtime = visible news gap |
| AI Newsroom V2 4-stage pipeline | Active news production — critical for editorial output |
| Existing Firestore analytics data | Historical data cannot be reconstructed |
| AdSense / ad slot structure | Revenue-critical |
| PWA service worker | Installed users depend on it for offline + push |
| All `/hukuk/*` legal pages | KVKK compliance — legally required |
| Push notification subscriptions | `pushSubscription` tokens stored in user documents |
| `next.config.ts` image `remotePatterns` | Removing Firebase Storage breaks all existing article images |
| `NEWSROOM_AUTO_PUBLISH_ENABLED=false` default | Safe default — changing requires explicit editorial decision |

---

## 20. Recommended PostgreSQL Table Mappings

### Already Implemented (`src/db/schema/`)
10 Postgres tables are schema-ready but **not yet migrated** (no migration files exist):

| Firestore Collection | Postgres Table | Schema File | Notes |
|---------------------|----------------|-------------|-------|
| `news` | `news` | `schema/news.ts` | Has `city_site_id` FK, `legacy_firestore_id` bridge field |
| `users` | `users` | `schema/users.ts` | Firebase UID as PK |
| `categories` | `categories` | `schema/categories.ts` | Has `parent_id`, `is_standalone` |
| (new: tenants) | `city_sites` | `schema/citySites.ts` | Tenant registry |
| (geographic ref) | `countries` | `schema/countries.ts` | `code (PK)`, `name`, `name_local` |
| (geographic ref) | `provinces` | `schema/provinces.ts` | 81 Turkish provinces with lat/lng |
| (geographic ref) | `districts` | `schema/districts.ts` | 973 districts, FK to provinces |
| (new: media) | `media` | `schema/media.ts` | Multi-provider (firebase/r2/external) |
| (new: join) | `news_locations` | `schema/newsLocations.ts` | news → provinces many-to-many |
| (new: join) | `news_categories` | `schema/newsCategories.ts` | news → categories many-to-many (isPrimary) |

### `news` Table — What the Existing Postgres Schema Has
Fields present: `id`, `legacy_firestore_id`, `slug`, `title`, `summary`, `description`, `content`, `html_content`, `status` (enum), `category_id` (FK), `city_site_id` (FK), `city_name`, `city_slug`, `district_name`, `district_slug`, `author_id` (FK), `author_display_name`, `source`, `source_url`, `thumbnail_url`, `cover_image_url`, `video_url`, `tags` (TEXT[]), `views_count`, `likes_count`, `comments_count`, `saves_count`, `shares_count`, `is_ai_generated`, `editor_type` (enum), `ai_editor_id`, `article_format` (enum), `confidence_score`, `is_breaking`, `is_featured`, `is_editor_pick`, `seo_title`, `seo_description`, `published_at`, `created_at`, `updated_at`

**Missing from Postgres `news` schema** (present in Firestore but not in PG yet):
- `body_blocks` (JSONB) — structured article body blocks
- `spot` — journalistic lead paragraph
- `seo_keywords` (TEXT[])
- `video_script` / `audio_url` / `audio_storage_path` / `audio_ready`
- `is_live_blog` / `live_updates` (JSONB)
- `social_published` / `story_published` — social sharing flags
- `rss_fingerprint` / `rss_guid` — dedup fields (if migrating dedup to Postgres)
- `infographic` (JSONB)

### Firestore Collections Not Yet in Postgres (Future Migrations)
| Collection | Recommended Table | Key Additional Columns |
|-----------|------------------|----------------------|
| `newsDrafts` | `news_drafts` | `status enum`, `confidence_score`, `city_site_id`, `moderation_reasons[]` |
| `sourceFingerprints` | `source_fingerprints` | `fingerprint (PK)`, `source_id`, `created_at` — critical for dedup |
| `events` | `events` | `city_site_id FK`, `venue`, `start_date`, `source_provider`, `ticket_url` |
| `analyticsDaily` | `analytics_daily` | `date (PK)`, `pageviews`, `unique_visitors`, `articles_published`, `city_site_id` |
| `sportsMatches` | `sports_matches` | `league_id`, `home_team`, `away_team`, `kickoff_at`, `status` |
| `sportsLeagues` | `sports_leagues` | `id`, `name`, `country`, `season` |
| `sportsStandings` | `sports_standings` | `league_id`, `team_id`, `position`, `points`, `updated_at` |
| `adBanners` | `ad_banners` | `slot_id`, `city_site_id FK nullable`, `image_url`, `link_url`, `is_active` |
| `aiEditors` | `ai_editors` | `id`, `persona_type`, `publish_policy`, `province_slugs[]`, `is_active` |
| `rssFeeds` | `rss_feeds` | `source_id`, `feed_url`, `enabled`, `max_items_per_run` |

---

## 21. Implementation Order Recommendation

| Phase | What | Blocker |
|-------|------|---------|
| **Phase 0** (complete) | This audit | — |
| **Phase 1** | Run `drizzle-kit generate` → `migrate`; update seed (`isActive: true` for Çanakkale); set `CITY_NETWORK_ENABLED=true` in staging; validate subdomain resolves city feed from Firestore `citySlug` | Neon `DATABASE_URL` must be provisioned |
| **Phase 2** | Add `canakkale.nahaber.com` in Vercel domains; test end-to-end city feed on staging; add wildcard `*.nahaber.com` for future cities | Vercel domain config + DNS |
| **Phase 3** | Add `city_site_id` to news pipeline writes (dual-write: Firestore + Postgres); enable `POSTGRES_READS_ENABLED` for city news API first | Phase 1 DB must be live |
| **Phase 4** | Complete city site UI pages (etkinlik, spor, ilceler); city-specific OG/SEO; category rails on city homepage | Phase 2 domain live |
| **Phase 5** | Configure city-specific AI editors (`AiEditorLocalConfig.provinces = ['canakkale']`); route local cron to emit `city_site_id` | Phase 3 dual-write stable |
| **Phase 6** | Expand to additional cities (seed more `city_sites` rows, set `isActive: true`); test tenant resolution per city | Phases 1-5 stable |
| **Phase 7** | Migrate `sourceFingerprints` to Postgres `source_fingerprints` table (critical dedup data) | Phase 3 stable, careful cutover |
| **Phase 8** | Analytics dual-write: `analyticsDaily` → Postgres; city-scoped analytics | Phase 3 |
| **Phase 9** | Evaluate Firebase Storage → Cloudflare R2 (or proxy via Next.js image route) | Cost/complexity analysis |
| **Phase 10** | Firestore sunset: once Postgres read/write covers 100% of paths, deprecate Firestore reads | All previous phases stable |

---

## Summary: Current State Assessment

**Production-ready and working:**
- National news pipeline: 51 cron jobs, 50+ AI editor IDs, DeepSeek-driven rewriting
- Full CMS admin panel with role-based access control
- Firebase Auth + Firestore as primary data store (100% of reads/writes)
- `citySlug` field already populated on all news documents
- Middleware with complete tenant resolution logic — just needs the feature flag enabled
- City site App Router pages exist (`/city-site/*`) — basic city feed from Firestore works today
- Postgres schema designed and Drizzle + Neon installed in `package.json`
- Hardcoded Çanakkale tenant fallback in `src/lib/tenant.ts`

**Three things blocking City Network launch:**
1. Postgres schema never migrated — `src/db/migrations/` is empty, `drizzle-kit generate` has not been run
2. Çanakkale `city_sites` row set to `isActive: false` in seed — DB lookup returns null
3. `CITY_NETWORK_ENABLED` not set to `true` in production environment

**The path to first city soft-launch is extremely short:** run the DB migration, flip `isActive` to `true` for Çanakkale, set `CITY_NETWORK_ENABLED=true`, and the basic city homepage feed (filtered from existing Firestore `citySlug` data) works immediately without touching any other code.
