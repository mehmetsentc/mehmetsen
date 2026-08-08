# NaHaber City Network — Phase 0 Codebase Audit

> **Tarih:** 9 Ağustos 2026
> **Branch:** `claude/nahabber-project-architecture-NZhLO`
> **Amaç:** Mevcut kod tabanının tam envanteri — PostgreSQL/R2/multi-tenant migrasyonuna hazırlık.

---

## 1. Mevcut Mimari (Architecture)

| Bileşen | Detay |
|---------|-------|
| **Framework** | Next.js 15 (App Router) — `next: ^15.0.0` |
| **React** | React 19 — `react: ^19.0.0` |
| **Runtime** | Node >= 20 |
| **Deploy** | Vercel Pro (Frankfurt `fra1`), Fluid Compute |
| **Config** | `next.config.ts` (TypeScript) |
| **CSS** | Tailwind CSS 3.4 + `@tailwindcss/typography` |
| **State** | Zustand 5 |
| **UI** | Lucide icons, Framer Motion, Sonner toasts |
| **Mobile** | Capacitor 8.4 (iOS + Android) |
| **Linting** | ESLint 9, Prettier 3.4 |
| **Testing** | Vitest 3.2.4 |
| **Analytics** | Vercel Analytics + Speed Insights |

### Vercel Configuration (`vercel.json`)
- 15 functions with 1024 MB memory
- **51 cron jobs** — newsroom, sports, social, SEO, archive
- Region: `fra1` (Frankfurt — closest to Turkey + Firebase EU)

---

## 2. Firestore Collection Haritası

**Kaynak:** `src/lib/firebase/collections.ts`

### Ana Koleksiyonlar
| Koleksiyon | Açıklama |
|-----------|----------|
| `users` | Kullanıcı profilleri |
| `posts` | Kullanıcı paylaşımları (community) |
| `news` | **Ana haber koleksiyonu** — tüm yayında haberler |
| `newsDrafts` | AI/RSS ingestion taslakları (onay bekleyenler) |
| `newsArchive` | Tarihsel arşiv haberleri |
| `newsQueue` | İşlem kuyruğu |
| `sourceFingerprints` | RSS dedup parmak izi |
| `videos` | Video içerikler |
| `comments` | Yorumlar |
| `likes` | Beğeniler |
| `saved` | Kaydedilenler |
| `follows` | Takip ilişkileri |
| `categories` | Kategori tanımları |
| `events` | Etkinlikler (Biletix/Bubilet/genel) |
| `eventReviews` | Etkinlik değerlendirmeleri |
| `reports` | Kullanıcı raporları |
| `blocks` | Engelleme kayıtları |
| `notifications` | Bildirimler |
| `conversations` | Mesajlaşma konuşmaları |
| `messages` | Mesajlar (subcollection: conversations/{id}/messages) |

### AI Newsroom Koleksiyonları
| Koleksiyon | Açıklama |
|-----------|----------|
| `aiQueue` | Multi-agent pipeline kuyruğu |
| `aiLogs` | AI agent işlem logları |
| `scheduledNews` | Zamanlanmış haberler |
| `factChecks` | Doğrulama kayıtları |
| `duplicates` | Duplikasyon tespiti |
| `socialPosts` | Sosyal medya paylaşım takibi |
| `translations` | Çoklu dil çevirileri |
| `rssFeeds` | RSS kaynak registry |
| `sources` | Ingestion kaynak meta |

### AI Editorial V2
| Koleksiyon | Açıklama |
|-----------|----------|
| `aiEditors` | AI editör persona konfigürasyonu |
| `aiEditorPrompts` | Versiyonlu prompt şablonları |
| `aiModelRegistry` | Model/provider kataloğu |
| `aiUsageEvents` | Maliyet dashboard verileri |

### Analytics
| Koleksiyon | Açıklama |
|-----------|----------|
| `analyticsDaily` | Günlük sayfa görüntüleme (YYYY-MM-DD) |
| `analyticsVitals` | Core Web Vitals |
| `analyticsEvents` | Sayfa-görüntüleme olayları (90 gün TTL) |
| `analyticsSessions` | Oturum verileri |
| `analyticsUniques` | Tekil ziyaretçi sayaçları |

### Diğer
| Koleksiyon | Açıklama |
|-----------|----------|
| `adBanners` | Reklam slot'ları |
| `contactSubmissions` | İletişim formu |
| `newsletterSubscribers` | E-posta bülteni |
| `gameScores` | Oyun skor tablosu |
| `sportsLeagues` | NaHaber Skor ligleri |
| `sportsMatches` | Maç verileri |
| `sportsStandings` | Puan durumu |
| `sportsSeasons` | Sezon verileri |
| `sportsSyncState` | Senkronizasyon durumu |
| `integrations` | OAuth token'ları (Gmail vb.) |

---

## 3. Firebase Storage Yapısı

**Kaynak:** `src/lib/firebase/storage.ts` → `StoragePaths`

| Path Pattern | Açıklama |
|-------------|----------|
| `avatars/{userId}/{fileName}` | Kullanıcı profil fotoğrafları |
| `posts/{userId}/{postId}/{fileName}` | Kullanıcı paylaşım medyası |
| `events/{eventId}/{fileName}` | Etkinlik görselleri |
| `events/images/{fileName}` | Paylaşımlı etkinlik görselleri |
| `news-images/{userId}/{fileName}` | Haber görselleri (legacy) |
| `news-videos/{userId}/{fileName}` | Haber videoları (legacy) |
| `ads/{bannerId}/{fileName}` | Reklam banner medyası |

**Bucket:** `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` (GCS)

---

## 4. Authentication (Kimlik Doğrulama)

**Kaynak:** `src/lib/firebase/auth.ts`, `src/lib/googleAuth.ts`, `src/lib/appleAuth.ts`

| Yöntem | Detay |
|--------|-------|
| **Firebase Auth** | Ana kimlik doğrulama katmanı |
| **Google Sign-In** | `signInWithPopup` → in-app browser'da `signInWithRedirect` fallback |
| **Apple Sign-In (Web)** | Firebase OAuthProvider popup → redirect fallback |
| **Apple Sign-In (iOS)** | Native `ASAuthorizationAppleIDProvider` via Capacitor plugin (`NativeAppleSignInPlugin.swift`) → `signInWithCredential` |
| **CMS Session** | HS256 cookie-based token (`cms_session`) — middleware admin guard |

### CMS Rol Sistemi
**Kaynak:** `src/types/cms.ts`

```
super_admin > managing_editor > editor > author | video_editor > user
```

Middleware `/admin/*` rotalarını `CMS_STAFF_ROLES` ile korur (edge-level guard).

---

## 5. Haber Veri Modeli (News Data Model)

**Kaynak:** `src/lib/newsMapper.ts` → `NewsDocument` interface

### Temel Alanlar
| Alan | Tip | Açıklama |
|------|-----|----------|
| `title` | string | Haber başlığı |
| `description` | string | Haber gövdesi |
| `content` | string | Tam içerik (ANKA workers) |
| `summary` | string | Feed teaser |
| `slug` | string | URL-friendly tanımlayıcı |
| `status` | string | `'published' \| 'pending' \| 'draft' \| 'archived' \| 'banned'` |
| `category` | string | Kategori slug |
| `categoryId` | string | Kategori ID |
| `type` | PostType | İçerik tipi |
| `source` | string | Kaynak |
| `sourceUrl` | string | Orijinal kaynak URL |

### Yazar Alanları
| Alan | Tip |
|------|-----|
| `author` | string |
| `authorId` | string |
| `authorUsername` | string |
| `authorDisplayName` | string |
| `authorPhotoURL` | string \| null |

### Coğrafya Alanları (Kritik — City Network İçin)
| Alan | Tip | Açıklama |
|------|-----|----------|
| `city` | string | Şehir adı (display: "Çanakkale") |
| `district` | string | İlçe adı |
| `citySlug` | string | **Şehir slug'ı (ASCII: "canakkale")** |
| `districtSlug` | string | İlçe slug'ı |
| `location` | object \| null | `{city, district?, country, lat, lng}` |

### Medya Alanları
| Alan | Tip |
|------|-----|
| `thumbnail` | string |
| `coverImageUrl` | string |
| `imageUrl` | string |
| `videoUrl` | string |
| `audioUrl` | string |
| `mediaItems` | Array<{type, url, caption, alt, credit, order}> |
| `galleryImages` | string[] |
| `additionalImages` | Array<{url, caption}> |

### Etkileşim Sayaçları
| Alan | Tip |
|------|-----|
| `viewsCount` | number |
| `likesCount` | number |
| `commentCount` / `commentsCount` | number |
| `savesCount` | number |
| `sharesCount` | number |

### AI / Newsroom Alanları
| Alan | Tip | Açıklama |
|------|-----|----------|
| `aiGenerated` | boolean | AI tarafından oluşturuldu |
| `editorId` | string | Worker editör ID |
| `editorType` | string | `'local' \| 'national' \| 'breaking' \| 'trend' \| 'influencer' \| 'event'` |
| `aiEditorId` | string | Persona V2 ID |
| `articleFormat` | string | `'standard' \| 'column' \| 'analysis'` |
| `confidenceScore` | number | 0–100 doğruluk skoru |
| `isBreaking` | boolean | Son dakika |
| `priorityScore` | number | 1–100 öncelik skoru |
| `featured` | boolean | Öne çıkan |
| `isEditorPick` | boolean | Editör seçimi |

### Zaman Damgaları
| Alan | Tip |
|------|-----|
| `createdAt` | number \| string \| Timestamp |
| `publishedAt` | number \| string \| null |
| `updatedAt` | number \| string |

### SEO Alanları
| Alan | Tip |
|------|-----|
| `seoTitle` | string |
| `seoDescription` | string |
| `seoKeywords` | string[] |
| `htmlContent` | string |
| `bodyBlocks` | ArticleBlock[] |

---

## 6. Kategori Modeli

**Kaynak:** `src/constants/config.ts` → `DEFAULT_CATEGORIES`

### CategoryDef Interface
```typescript
interface CategoryDef {
  id: string
  name: string
  slug: string
  iconName: string
  color: string
  parentId?: string    // alt kategori ilişkisi
  standalone?: boolean // izole alt kategori (üst feed'de gösterilmez)
}
```

### Ana Kategoriler (48 tanım)
**Üst düzey:** trend, gundem, yerel-haber, siyaset, dunya, kibris-haberleri, ekonomi, teknoloji, saglik, bilim, egitim, cevre-iklim, oyun-espor, din-inanc, magazin, spor, kultur, yasam, gastronomi, otomobil, meteoroloji, turizm, gezi, asayis, tarih, son-dakika, etkinlikler

**Alt kategoriler (parentId):**
- **Ekonomi:** borsa (standalone), kripto (standalone), finans-piyasa, emlak-konut, enerji, is-kariyer
- **Spor:** futbol (standalone), basketbol (standalone), voleybol (standalone), hentbol, atletizm, gures, dunya-kupasi-2026 (standalone)
- **Kültür:** sinema, tiyatro, konser, festival
- **Yaşam:** astroloji, moda, anne-cocuk, dekorasyon, iliskiler

### Önemli Fonksiyonlar
- `getCategoryFamily(parentId)` — parent + tüm alt kategoriler (Firestore `in` sorgusu)
- `getHomeFeedCategoryFamily(parentId)` — max 10 ID (Firestore limiti)
- `getSubcategories(parentId)` — alt kategori listesi
- `getAdminCategoryGroups()` — CMS gruplu seçici

---

## 7. Route Haritası (App Router)

**Kaynak:** `src/constants/routes.ts`, `src/app/` dizin yapısı

### Public (main) Rotalar
| Route | Sayfa |
|-------|-------|
| `/` | Ana sayfa (app/page.tsx — redirect to /feed) |
| `/feed` | Ana akış |
| `/haber/[slug]` | Haber detay |
| `/kategori/[id]` | Kategori sayfası |
| `/yerel` | Yerel haber ana sayfa |
| `/yerel/[citySlug]` | **Şehir bazlı yerel haber** |
| `/etiket/[slug]` | Etiket sayfası |
| `/yazar/[username]` | Yazar profili |
| `/search` | Arama |
| `/reels` | Video feed (TikTok-style) |
| `/events` | Etkinlikler |
| `/skor` | NaHaber Skor |
| `/oyunlar` | Oyunlar |
| `/oyunlar/[slug]` | Oyun detay |
| `/canli/[slug]` | Canlı blog |
| `/futbol-canli` | Canlı futbol |
| `/weather` | Hava durumu |
| `/muzeler` | Müzeler |
| `/discover` | Keşfet |
| `/influencer` | Influencer sayfası |
| `/cok-okunanlar` | Çok okunanlar |
| `/post/[id]` | Topluluk paylaşım detay |
| `/post/create` | Paylaşım oluştur |
| `/profile/[username]` | Kullanıcı profili |

### Auth Rotalar
| Route | Sayfa |
|-------|-------|
| `/login` | Giriş |
| `/register` | Kayıt |
| `/onboarding` | Onboarding |

### Settings Rotalar
`/settings`, `/settings/profile`, `/settings/appearance`, `/settings/notifications`, `/settings/privacy`, `/settings/help`, `/settings/about`, `/settings/terms`, `/settings/privacy-policy`, `/settings/account/delete`

### Admin (CMS) Rotalar
`/admin`, `/admin/dashboard`, `/admin/news`, `/admin/news/create`, `/admin/news/[id]/edit`, `/admin/newsroom`, `/admin/approvals`, `/admin/approvals/[id]`, `/admin/categories`, `/admin/users`, `/admin/authors`, `/admin/editors`, `/admin/ai-editors`, `/admin/ai-editors/[id]`, `/admin/ai/news`, `/admin/ai/video`, `/admin/videos`, `/admin/events`, `/admin/archive`, `/admin/submissions`, `/admin/inbox`, `/admin/social`, `/admin/social/gorsel`, `/admin/ads`, `/admin/seo`, `/admin/cron`, `/admin/api-management`, `/admin/analytics`, `/admin/settings`, `/admin/reports`, `/admin/menu`, `/admin/quick`, `/admin/posts`

### Yasal Sayfalar
`/hakkimizda`, `/iletisim`, `/kunye`, `/editoryal-ilkeler`, `/aydinlatma-metni`, `/gizlilik-politikasi`, `/hukuk/kvkk`, `/hukuk/cerez-politikasi`, `/hukuk/gizlilik`, `/hukuk/kullanim-kosullari`, `/site-haritasi`

---

## 8. API Yapısı

**Kaynak:** `src/app/api/` — toplam 170+ route handler

### Cron API'ları (`/api/cron/newsroom/*`)
afad, breaking, local, ai-pipeline, ai-columns, process-queue, queue-purge, draft-reprocess, national, gundem, finans, politics, sports, world, weather, technology, kripto, health, entertainment, magazine, gastronomi, otomobil, trend, video-process, video-queue, seo, thin-content-backfill, influencer, archive, aa-content, anka-breaking, anka-local, voleybol, basketbol, futbol, borsa, bilim-teknoloji, saglik-sozcu, sozcu-breaking, expire-breaking, freenews, kibris, hackernews, gezi, ingest

### Admin API'ları (`/api/admin/*`)
news/[id], news/ai-image-seo, news/ai-image-placement, newsroom/*, news-drafts/*, news-queue/*, migrate/*, gmail/*, social/*, ads/*, ai-editors, ai-assist, recategorize, seo-backfill, editorial-review/batch, analytics, cron/*, queue/purge, media/scrape-video, backfill-*

### Public API'ları
- `/api/feed/more` — sayfalama
- `/api/feed/category` — kategori feed
- `/api/news/view` — görüntüleme sayacı
- `/api/news/top` — en çok okunan
- `/api/news/on-this-day` — bu gün tarihte
- `/api/search` — arama
- `/api/weather` — hava durumu
- `/api/events/*` — etkinlik servisleri
- `/api/sports/*` — spor servisleri
- `/api/finance/*` — finans verileri
- `/api/og-image` — Open Graph görsel üretici
- `/api/rss` — RSS feed
- `/api/push/*` — push bildirim
- `/api/contact` — iletişim formu
- `/api/health` — sağlık kontrolü
- `/api/moderate` — içerik moderasyon

---

## 9. Migrasyon Riskleri

| Risk | Seviye | Detay |
|------|--------|-------|
| **Firestore sorgu bağımlılıkları** | 🔴 Yüksek | 170+ API route + servisler doğrudan Firestore kullanıyor |
| **Real-time listeners** | 🟠 Orta | Client-side Firestore `onSnapshot` kullanımları mevcut |
| **51 Vercel cron job** | 🟠 Orta | Tamamı Firestore'a yazar/okur |
| **Firebase Auth token'ları** | 🟡 Düşük | Token doğrulama server-side (`verifyCmsToken`) |
| **Storage URL'leri** | 🔴 Yüksek | `firebasestorage.googleapis.com` URL'leri haberlerde gömülü |
| **Admin SDK kullanımı** | 🟠 Orta | `getAdminFirestore()` tüm server-side kodu besliyor |
| **RSS fingerprint dedup** | 🟡 Düşük | `sourceFingerprints` koleksiyonu — migrasyon sırasında boşluk riski |
| **Analytics veri kaybı** | 🟡 Düşük | Firestore analytics toplanabilir, geçiş döneminde gap |
| **Capacitor native plugins** | 🟡 Düşük | Apple Sign-In native → credential chain değişmez |
| **SEO / URL stabilitesi** | 🔴 Yüksek | Slug'lar değişirse 404 + Google index kaybı |
| **Subdomain routing** | 🟠 Orta | middleware.ts'te hostname handling **YOK** — eklenecek |

---

## 10. City Network İçin Değiştirilecek Dosyalar

### Kritik (Phase 1-2)
| Dosya | Değişiklik |
|-------|-----------|
| `middleware.ts` | Hostname → tenant çözümleme (`canakkale.nahaber.com`) |
| `src/lib/firebase/collections.ts` | Tenant-aware collection prefix veya PG migration |
| `src/services/newsService.server.ts` | City-scoped queries |
| `src/constants/cities.ts` | Tenant config + subdomain mapping |
| `src/app/(main)/yerel/[citySlug]/page.tsx` | Tenant redirect/merge |
| `src/lib/newsMapper.ts` | Tenant context propagation |
| `src/lib/feedRanking.ts` | City-aware ranking |
| `next.config.ts` | Subdomain rewrites, CSP headers |
| `vercel.json` | Multi-domain wildcard |

### Orta Vadeli (Phase 3-5)
| Dosya | Değişiklik |
|-------|-----------|
| `src/constants/config.ts` | Tenant-specific categories |
| `src/services/newsroom/geoEngine.ts` | Tenant routing in AI pipeline |
| `src/services/newsroom/categoryEngine.ts` | Tenant-aware classification |
| `src/services/newsroom/pipeline.ts` | Multi-tenant ingestion |
| `src/lib/ai/editorial/categoryHint.ts` | Tenant category hints |
| `src/lib/ai/editorial/editorRouter.ts` | Per-city editor routing |
| `src/app/api/cron/newsroom/local/route.ts` | Per-tenant cron |
| `src/types/news.ts` | tenantId field |
| `src/types/newsItem.ts` | tenant-aware feed types |

---

## 11. Dokunulmaması Gereken Özellikler

| Özellik | Sebep |
|---------|-------|
| Firebase Auth flow (Google + Apple) | Phase 1'de korunmalı |
| `/haber/[slug]` URL yapısı | SEO indeks + Google News |
| RSS fingerprint deduplication | Veri bütünlüğü |
| CMS rol/permission sistemi | Stabil, genişletilebilir |
| Capacitor native layer | App Store onaylı build |
| vercel.json cron schedule | Haber akışı sürekliliği |
| AI Newsroom V2 pipeline | Haber üretimi kritik |
| Mevcut analytics data | Tarihsel veri |
| AdSense/reklam slot yapısı | Gelir akışı |
| PWA service worker | Kurulu kullanıcı deneyimi |

---

## 12. Önerilen PostgreSQL Eşlemeleri (Kavramsal)

### `news` → `articles` tablosu
| Firestore Field | PostgreSQL Column | Type |
|----------------|-------------------|------|
| doc.id | `id` | UUID (PK) |
| slug | `slug` | VARCHAR UNIQUE |
| title | `title` | TEXT NOT NULL |
| description | `body` | TEXT |
| content | `content_full` | TEXT |
| summary | `summary` | VARCHAR(500) |
| status | `status` | ENUM('draft','published','archived','banned') |
| categoryId | `category_id` | VARCHAR → FK categories |
| city | `city_name` | VARCHAR |
| citySlug | `city_slug` | VARCHAR → INDEX |
| district | `district_name` | VARCHAR |
| districtSlug | `district_slug` | VARCHAR |
| **— (yeni)** | `tenant_id` | VARCHAR → FK tenants |
| authorId | `author_id` | VARCHAR → FK users |
| source | `source` | VARCHAR |
| sourceUrl | `source_url` | TEXT |
| thumbnail | `thumbnail_url` | TEXT |
| coverImageUrl | `cover_image_url` | TEXT |
| videoUrl | `video_url` | TEXT |
| tags | `tags` | TEXT[] (array) |
| viewsCount | `views_count` | INTEGER DEFAULT 0 |
| likesCount | `likes_count` | INTEGER DEFAULT 0 |
| commentCount | `comments_count` | INTEGER DEFAULT 0 |
| isBreaking | `is_breaking` | BOOLEAN DEFAULT false |
| featured | `is_featured` | BOOLEAN DEFAULT false |
| confidenceScore | `confidence_score` | SMALLINT |
| editorType | `editor_type` | VARCHAR |
| aiGenerated | `is_ai_generated` | BOOLEAN DEFAULT false |
| publishedAt | `published_at` | TIMESTAMPTZ |
| createdAt | `created_at` | TIMESTAMPTZ DEFAULT now() |
| updatedAt | `updated_at` | TIMESTAMPTZ DEFAULT now() |

### `tenants` tablosu (yeni)
| Column | Type | Açıklama |
|--------|------|----------|
| `id` | VARCHAR PK | 'national', 'canakkale', 'istanbul' |
| `slug` | VARCHAR UNIQUE | subdomain slug |
| `display_name` | VARCHAR | "Çanakkale" |
| `domain` | VARCHAR | "canakkale.nahaber.com" |
| `city_slug` | VARCHAR | 'canakkale' |
| `is_active` | BOOLEAN | tenant etkin mi |
| `created_at` | TIMESTAMPTZ | |

### `users` → `users` tablosu
| Firestore Field | PostgreSQL Column | Type |
|----------------|-------------------|------|
| uid | `id` | VARCHAR PK (Firebase UID) |
| email | `email` | VARCHAR UNIQUE |
| username | `username` | VARCHAR UNIQUE |
| displayName | `display_name` | VARCHAR |
| role | `role` | ENUM |
| citySlug | `home_city_slug` | VARCHAR |
| createdAt | `created_at` | TIMESTAMPTZ |

### `categories` → `categories` tablosu
| Column | Type |
|--------|------|
| `id` | VARCHAR PK |
| `name` | VARCHAR |
| `slug` | VARCHAR UNIQUE |
| `parent_id` | VARCHAR → FK self |
| `icon_name` | VARCHAR |
| `color` | VARCHAR(7) |
| `is_standalone` | BOOLEAN |
| `tenant_id` | VARCHAR → FK tenants (nullable = national) |

### `events` → `events` tablosu
| Column | Type |
|--------|------|
| `id` | UUID PK |
| `title` | TEXT |
| `city_slug` | VARCHAR → INDEX |
| `tenant_id` | VARCHAR → FK tenants |
| `venue` | VARCHAR |
| `start_date` | TIMESTAMPTZ |
| `source_provider` | VARCHAR |

---

## 13. Uygulama Sırası (Phases 1–10)

| Phase | Açıklama | Kritik Bağımlılık |
|-------|----------|-------------------|
| **Phase 0** ✅ | Bu audit | — |
| **Phase 1** | Neon PostgreSQL + Drizzle ORM kurulumu, schema tanımları, tenant tablosu | package.json, yeni `src/db/` dizini |
| **Phase 2** | Middleware tenant çözümleme (hostname → tenantId) | `middleware.ts` |
| **Phase 3** | Dual-write bridge — Firestore + PG paralel yazım | Tüm write servisler |
| **Phase 4** | News read path'i PG'ye taşıma (read-from-PG) | newsService.server.ts |
| **Phase 5** | Cloudflare R2 storage migration + image proxy | StoragePaths, next.config.ts |
| **Phase 6** | City tenant UI — subdomain layout, city-scoped feed | App Router layout.tsx |
| **Phase 7** | AI Newsroom multi-tenant — per-city ingestion | Cron jobs, pipeline |
| **Phase 8** | Analytics migration (PG analytics schema) | analyticsDaily → PG |
| **Phase 9** | Firestore sunset (read-path tamamen PG) | Tüm client queries |
| **Phase 10** | Performance tuning, edge caching, CDN strategy | vercel.json, headers |

---

## 14. Mevcut Coğrafya Desteği

### Yerel Haber Sistemi
- **Route:** `/yerel` (tüm yerel haberler), `/yerel/[citySlug]` (şehir bazlı)
- **81 il tam desteği:** `src/constants/cities.ts` → `TURKISH_PROVINCES` (lat/lng dahil)
- **İlçe desteği:** `src/constants/turkishDistricts.ts` — 973 ilçe
- **Slug normalizasyonu:** `normalizeCitySlug()` — legacy broken slugs, district→province mapping
- **Haversine distance sorting:** `nearestProvinceSlug(lat, lng)` — etkinlik sıralaması

### News Fields
- `city` — display name ("Çanakkale")
- `citySlug` — ASCII slug ("canakkale")
- `district` — ilçe adı
- `districtSlug` — ilçe slug'ı
- `location` — `{city, district?, country, lat, lng}` object

### Events City Filter
- Biletix Solr: `getCityCategoryName(slug)` → `fq=city:İstanbul`
- Bubilet: city URL pattern
- All providers: `PROVINCE_COORDS_BY_SLUG` → proximity sort

### User City Preference
- `User.citySlug` — onboarding'de seçilen şehir
- `CITY_COOKIE` = `'city'` — cookie bazlı yerel tercih

---

## 15. AI Şehir/Kategori Sınıflandırması

### GeoEngine (`src/services/newsroom/geoEngine.ts`)
- `extractCityFromText(text)` — haber metninden 81 il tespiti (regex, ambiguous filter)
- `enrichGeo(rewriteResult)` — AI yeniden yazım sonrasında city/district/country zenginleştirme
- National scope filtreleme: cumhurbaşkanı, TBMM vb. → city=null
- Ambiguous city slugs: agri, van, ordu, mus, bolu, batman → yalnız metin eşleşmesi ile atanmaz

### CategoryEngine (`src/services/newsroom/categoryEngine.ts`)
- AI-assigned kategori normalizasyonu
- Keyword heuristics (regex pattern matching)
- Editor type overrides (local → yerel-haber)
- `CATEGORY_ALIASES` — İngilizce→Türkçe mapping

### CategoryHint (`src/lib/ai/editorial/categoryHint.ts`)
- CMS auto-routing: hızlı pre-classification
- `extractCityFromText` + `extractDistrictSlug` entegrasyonu
- Confidence score ile multi-signal karar

---

## 16. package.json Anahtar Bağımlılıklar

| Paket | Versiyon | Rol |
|-------|---------|-----|
| `next` | ^15.0.0 | Framework |
| `react` / `react-dom` | ^19.0.0 | UI |
| `firebase` | ^12.14.0 | Client SDK |
| `firebase-admin` | ^13.10.0 | Server SDK |
| `zustand` | ^5.0.0 | State management |
| `framer-motion` | ^12.42.0 | Animasyon |
| `zod` | ^3.24.0 | Validasyon |
| `rss-parser` | ^3.13.0 | RSS ingestion |
| `cheerio` | ^1.2.0 | HTML parsing |
| `@extractus/article-extractor` | ^8.1.0 | Makale çıkarma |
| `web-push` | ^3.6.7 | Push bildirimleri |
| `@capacitor/core` | ^8.4.1 | Mobile bridge |
| `@vercel/analytics` | ^1.4.1 | Analytics |
| `tailwindcss` | ^3.4.0 | CSS framework |
| `vitest` | 3.2.4 | Testing |

### Eksik Olanlar (Onaylama)
| Paket | Durum |
|-------|-------|
| **Drizzle ORM** | ❌ YOK — kurulacak |
| **@neondatabase/serverless** | ❌ YOK — kurulacak |
| **@cloudflare/r2** / **@aws-sdk/client-s3** | ❌ YOK — kurulacak |
| **PostgreSQL client (pg)** | ❌ YOK — kurulacak |
| Herhangi bir ORM | ❌ YOK — proje tamamen Firestore-native |

---

## 17. Middleware Hostname Handling

**Kaynak:** `middleware.ts`

### Mevcut Durum
- **Hostname/subdomain routing: YOK** — middleware yalnızca:
  1. `/admin/*` CMS session guard (cms_session cookie → role check)
  2. Geo-based language/country cookie (`x-vercel-ip-country` header)
- Matcher: `['/((?!api|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)']`
- Hiçbir tenant/subdomain logic mevcut değil

### City Network İçin Gerekli
```typescript
// Örnek: canakkale.nahaber.com → tenantId = 'canakkale'
const hostname = request.headers.get('host') || ''
const tenantSlug = hostname.split('.')[0] // 'canakkale'
// → request header veya cookie olarak propagate
```

---

## 18. Environment Variables Yapısı

**Kaynak:** `.env.example`, `.env.local.example`

### NEXT_PUBLIC_ (Client-exposed)
| Değişken | Açıklama |
|----------|----------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase client config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | FCM sender |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | App ID |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | GA measurement |
| `NEXT_PUBLIC_APP_URL` | Canonical URL (https://www.nahaber.com) |
| `NEXT_PUBLIC_APP_NAME` | Site adı |
| `NEXT_PUBLIC_API_URL` | API base URL |
| `NEXT_PUBLIC_ENABLE_NOTIFICATIONS` | Feature flag |
| `NEXT_PUBLIC_ENABLE_ANALYTICS` | Feature flag |
| `NEXT_PUBLIC_ADMIN_UIDS` | (deprecated) admin UIDs |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | GSC |
| `NEXT_PUBLIC_YANDEX_SITE_VERIFICATION` | Yandex |
| `NEXT_PUBLIC_BING_SITE_VERIFICATION` | Bing |

### Server-only
| Değişken | Açıklama |
|----------|----------|
| `FIREBASE_ADMIN_PROJECT_ID` | Admin SDK |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Admin SDK |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Admin SDK |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Alternatif full JSON |
| `CRON_SECRET` | Cron authentication |
| `EVENTS_SYNC_SECRET` | Event sync auth |
| `OPENAI_API_KEY` | AI moderation |
| `DEEPSEEK_API_KEY` | AI newsroom (haber yazım) |
| `GEMINI_API_KEY` | Google Search grounding |
| `SUPER_ADMIN_EMAIL` | Bootstrap admin |
| `CMS_SESSION_SECRET` | Middleware token sign |
| `INDEXNOW_KEY` | SEO IndexNow |
| `THREADS_USER_ID` / `THREADS_ACCESS_TOKEN` | Threads API |
| `SERPER_API_KEY` / `BRAVE_SEARCH_API_KEY` | Arama fallback |
| `JINA_API_KEY` | Scraper bypass |
| `NEWSROOM_AUTO_PUBLISH_ENABLED` | Otonom yayın |
| `NEWSROOM_AUTO_PUBLISH_THRESHOLD` | Confidence eşik (70) |

### City Network İçin Eklenecek (Phase 1+)
```
DATABASE_URL=postgresql://...@...neon.tech/nahaber
NEON_DATABASE_URL=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_PUBLIC_URL=...
```

---

## Özet: Neon/R2/Drizzle Mevcut Durumu

| Teknoloji | Projede Var mı? | Kanıt |
|-----------|----------------|-------|
| **Neon PostgreSQL** | ❌ HAYIR | `grep` sonucu: 0 eşleşme |
| **Drizzle ORM** | ❌ HAYIR | `grep` sonucu: 0 eşleşme, package.json'da yok |
| **Cloudflare R2** | ❌ HAYIR | `grep` sonucu: 0 eşleşme |
| **Herhangi bir SQL ORM** | ❌ HAYIR | Tüm veri erişimi Firebase SDK üzerinden |
| **PostgreSQL/pg client** | ❌ HAYIR | package.json'da yok |

---

## Sonuç

NaHaber şu anda **tamamen Firebase-native** bir uygulamadır. City Network dönüşümü için:

1. **Middleware tenant routing** en kritik ilk adım — mevcut middleware'e hostname çözümleme eklenmeli
2. **Coğrafya altyapısı güçlü** — 81 il + 973 ilçe + slug normalizasyonu + AI geo-enrichment hazır
3. **`citySlug` field tüm haberlerde mevcut** — PG migration sırasında tenant routing kolayca uygulanabilir
4. **Firebase Auth korunmalı** — Phase 1'de auth değişmez, yalnızca data layer geçer
5. **51 cron job dikkatle migrasyona dahil edilmeli** — dual-write bridge ile paralel çalışmalı

**Önerilen sonraki adım:** Phase 1 — Neon + Drizzle kurulumu, schema tanımları, tenant tablosu oluşturma.
