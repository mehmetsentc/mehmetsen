# NaHaber Architecture Report
*Generated: June 2026 | Stack: Next.js 15 App Router + TypeScript + Firebase/Firestore + OpenAI GPT-4o-mini*

---

## 1. Current Architecture Overview

```
News Sources (RSS/API)
       ↓
  Cron Jobs (14 scheduled endpoints)
       ↓
  Article Extractor (full-text fetch + clean)
       ↓
  AI Editor (GPT-4o-mini)
       ↓  headline · spot · summary · content · SEO · category · tags · location · readingTime
  Firestore (news collection)
       ↓
  Next.js Feed (real-time onSnapshot + infinite scroll)
       ↓
  Video Queue (6h cron → videoQueue collection)
```

---

## 2. Cron Jobs (17 endpoints)

| Endpoint | Schedule | Purpose |
|---|---|---|
| `/api/cron/newsroom/ingest` | Every 15 min | Main RSS ingest → AI pipeline |
| `/api/cron/newsroom/national` | Every 20 min | National news sources |
| `/api/cron/newsroom/breaking` | Every 5 min | Breaking news priority |
| `/api/cron/newsroom/local` | Every 30 min | Local/city news |
| `/api/cron/newsroom/entertainment` | Every 30 min | Entertainment/culture |
| `/api/cron/newsroom/finans` | Every 30 min | Finance data |
| `/api/cron/newsroom/kripto` | Every 30 min | Crypto prices |
| `/api/cron/newsroom/afad` | Every 1 min | AFAD earthquake alerts |
| `/api/cron/newsroom/trend` | Every 5 min | Trending score update |
| `/api/cron/newsroom/seo` | Every 1 hour | SEO gap filling |
| `/api/cron/newsroom/video-queue` | Every 6 hours | Queue articles for video |
| `/api/cron/newsroom/archive` | Every 6 hours | Archive old content |
| `/api/cron/newsroom/weather` | Every 1 hour | Weather news |
| `/api/cron/newsroom/influencer` | Every 2 hours | Influencer tracking |
| `/api/cron/news-ingest` | (legacy) | Old ingest route |
| `/api/cron/weather-news` | (legacy) | Old weather route |
| `/api/admin/cron/trigger` | Manual | CMS manual trigger |

---

## 3. Firestore Collections

| Collection | Purpose | Key Fields |
|---|---|---|
| `news` | Published articles | title, spot, summary, content, seoTitle, seoDescription, categoryId, tags, location, readingTimeMinutes, status, coverImageUrl, videoQueued |
| `newsDrafts` | AI-generated drafts pending review | draftStatus: pending_review/approved/rejected |
| `newsArchive` | Archived/old articles | archivedAt |
| `newsQueue` | Ingest queue (dedupe buffer) | fingerprint, processedAt |
| `sourceFingerprints` | Deduplicate seen articles | url, titleHash |
| `users` | User profiles + roles | role: super_admin/managing_editor/editor/author/video_editor/user |
| `videos` | TikTok-style video feed | videoUrl, title, likes, views, categoryId |
| `videoQueue` | AI video generation queue | newsId, status: pending/processing/done, priority |
| `posts` | User-generated posts | (legacy social layer) |
| `comments` | Comments on posts/news | |
| `likes` | Like records | |
| `saved` | Bookmarks | |
| `follows` | User follows | |
| `notifications` | Push notifications | |
| `apiKeys` | CMS API keys | key, permissions, usageCount |
| `cronRuns` | Cron job history | jobName, status, durationMs, itemsProcessed |

---

## 4. AI Pipeline (`aiNewsEditor.ts`)

**Model:** GPT-4o-mini (cost-optimized for high volume)

**Output fields per article:**

| Field | Description | Limit |
|---|---|---|
| `title` | Professional headline | 120 chars |
| `spot` | Lead paragraph (5W+1H journalistic) | 60-120 words |
| `summary` | 1-sentence feed teaser | 120 chars |
| `content` | Full 3-6 paragraph rewrite | 200-500 words |
| `seoTitle` | Google-optimized title | 55-65 chars |
| `seoDescription` | SERP meta description | 145-160 chars |
| `categoryId` | Auto-detected category | — |
| `categoryConfidence` | AI confidence 0-100 | — |
| `tags` | 2-4 lowercase keywords | — |
| `city` / `district` / `country` | Location extraction | — |
| `isBreaking` | Breaking news flag | — |

**Rejection criteria:**
- Content < 150 chars after extraction
- Duplicate (fingerprint match via `sourceFingerprints`)
- Extraction failure (paywall/403/timeout)

---

## 5. RSS Collectors

Sources live in `/src/services/newsroom/sources/` and `/src/services/rss/`:
- `rssFetcher.ts` — Generic RSS parser + HTTP fetch
- `articleFetcher.ts` — Full-text extractor (bypasses RSS snippet)
- `batchSources.ts` — Multi-source parallel runner
- `localSources.ts` — City-specific RSS feeds
- `sources.ts` — Master source registry

---

## 6. Article Page

Route: `/news/[slug]` (RSC + client hydration)  
- Server-side metadata generation via `generateMetadata()`
- JSON-LD structured data
- Full AI-written content rendered (not RSS snippets)
- `spot` displayed as featured lead block (blockquote)
- Reading time, share buttons, related articles

---

## 7. Admin / CMS Pages

| Route | Module |
|---|---|
| `/admin` | Dashboard (KPIs, live feed, queue) |
| `/admin/news` | News management + editorial workflow |
| `/admin/videos` | Video queue management |
| `/admin/authors` | Author management |
| `/admin/editors` | Editor management + permission matrix |
| `/admin/users` | Full user management + ban/unban |
| `/admin/ai/news` | AI News Assistant (6 modes) |
| `/admin/ai/video` | AI Video Script Generator (5 types) |
| `/admin/seo` | SEO audit + AI auto-fix |
| `/admin/cron` | Real-time cron monitoring + manual trigger |
| `/admin/api-management` | API key CRUD |
| `/admin/analytics` | Traffic + category breakdown |
| `/admin/settings` | System settings |

**Roles:** `super_admin → managing_editor → editor → author | video_editor → user`

---

## 8. Video Feed (Teve / Reels)

- TikTok-style vertical swipe (`/reels`)
- Forced dark mode wrapper
- `nahaber.com` vertical watermark
- Bold white title at bottom-left
- Right-rail actions: ThumbsUp, ThumbsDown, Share, Comments, Save, Sound, More
- `videoQueue` collection feeds into `videos` collection (generation pipeline pending)

---

## 9. Performance Status (post-optimization)

| Optimization | Status |
|---|---|
| Next.js Image optimization (avif/webp) | ✅ |
| Image cache TTL 7 days | ✅ |
| `optimizePackageImports` (lucide, date-fns, firebase) | ✅ |
| `SafeNewsImage` with lazy loading | ✅ |
| Dynamic import for ReelsPageClient | ✅ |
| Suspense boundaries on feed page | ✅ |
| Infinite scroll (IntersectionObserver) | ✅ |
| Live feed poll pause on tab hidden | ✅ |
| Mobile poll interval 60s (vs 30s desktop) | ✅ |
| Feed cache (appStateContext) | ✅ |
| Skeleton loaders | ✅ |
| Raw `<img>` → `SafeNewsImage` in search | ✅ |
| Firestore pagination (startAfter cursor) | ✅ |

---

## 10. Missing / Enhancement Opportunities

### HIGH PRIORITY

1. **AI Video Factory** — `videoQueue` exists but actual AI video generation is not wired  
   → Need: Script generation → TTS voiceover → image-to-video → Firebase Storage upload → `videos` collection

2. **News Management CMS** (Task #34) — editorial workflow partially built  
   → Need: Approve/reject/publish workflow, inline AI rewrite, bulk actions

3. **Firestore Composite Indexes** — missing indexes will cause query failures at scale  
   → Need: `news(status + publishedAt)`, `news(categoryId + publishedAt)`, `news(citySlug + publishedAt)`

4. **Video generation processor** — the `videoQueue` worker only enqueues, doesn't process  
   → Need: A separate processor cron that picks up `pending` queue items and generates actual videos

### MEDIUM PRIORITY

5. **Duplicate detection enhancement** — currently fingerprint-based, could add semantic similarity
6. **Search indexing** — Firestore full-text search is manual; consider Algolia integration
7. **Push notifications** — notification collection exists but FCM not wired for breaking news
8. **CDN for videos** — Firebase Storage works but no CDN edge caching configured

### LOW PRIORITY

9. **PWA manifest** — mobile install prompt not implemented
10. **RSS sitemap** — `/api/rss` exists but not linked to sitemap generators
11. **A/B testing** — headline variants via AI not implemented

---

## 11. Implementation Roadmap

```
Phase A — AI Video Factory (next priority)
  A1. videoProcessor cron: pick pending queue items
  A2. AI script generator → TTS (ElevenLabs/Google TTS)
  A3. Image-to-video (Luma / Runway / simple slideshow ffmpeg)
  A4. Firebase Storage upload → videos collection
  A5. Video feed displays generated videos

Phase B — News Management Workflow completion
  B1. News list with filters + bulk actions
  B2. Approve/reject/publish buttons wired to API routes
  B3. Inline AI rewrite toolbar
  B4. SEO preview panel

Phase C — Firestore Indexes + Scale
  C1. Deploy composite indexes (firestore.indexes.json)
  C2. Server-side rendering for article page (ISR)
  C3. CDN video delivery

Phase D — Engagement Layer
  D1. Push notifications for breaking news (FCM)
  D2. Search → Algolia
  D3. PWA install
```
