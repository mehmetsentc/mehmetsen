# AI Editörler Raporu — NaHaber Newsroom

**Tarih:** 12 Ağustos 2026  
**Branch:** `claude/nahabber-project-architecture-NZhLO`

## Özet: Tekrar Haber filtresi neden boştu?

| Katman | Ne yapıyor? | Nereye yazıyor? |
|--------|-------------|-----------------|
| `queueDuplicateCheck` | AI öncesi fingerprint / storyLibrary / benzerlik | `markQueueDuplicate` → `newsDrafts` stub |
| `chiefEditor` (pipeline) | AI sonrası duplikat kararı | `createDuplicateNewsStub` → `newsDrafts` |
| `aiNewsEditor` | Rewrite sırasında duplikat | Hata fırlatır, stub yok |
| `editorial-review` cron | Pending haberleri 48s penceresinde karşılaştırır | `news` koleksiyonu `isDuplicate: true` |

**Kök neden:** CMS **Tekrar Haber** filtresi `adminNewsService.list('pending')` çağırıyordu — yalnızca `draftStatus: pending_review` taslakları, legacy `status: pending` haberleri ve kuyruk kayıtlarını getiriyordu. Duplikat audit stub'ları ise `newsDrafts` içinde `draftStatus: 'rejected'`, `isDuplicate: true`, `categoryId: 'tekrarlayan'` ile yazılıyordu. Filtre bu koleksiyonu hiç sorgulamıyordu → **0 haber**.

**Düzeltme:** `listDuplicateNews()` eklendi — `newsDrafts.isDuplicate` + `news.isDuplicate` sorgular. Ek olarak `markQueueDuplicate` her zaman audit stub oluşturur (existingNewsId yoksa `'unknown'`).

---

## Duplikasyon akışı (şema)

```
RSS/Worker → newsQueue
    ↓
queueDuplicateCheck ──hit──→ markQueueDuplicate → newsDrafts (tekrarlayan stub)
    ↓ miss
AI pipeline → chiefEditor ──duplicate──→ newsDrafts stub (yayın yok)
    ↓ publish path
news (published) ← editorial-review cron ──duplicate──→ news (pending + isDuplicate)
```

---

## Newsroom worker envanteri (`EDITOR_REGISTRY`)

Kaynak: `src/services/newsroom/config.ts` + `vercel.json` cron eşleşmesi.

### Ingest worker'ları (RSS → kuyruk → pipeline)

| ID | Rol | Cron (config) | Vercel cron | Sorun |
|----|-----|---------------|-------------|-------|
| `local-news` | AA/DHA/Anka — 81 il Google News rotasyonu | 10m | `0 */1 * * *` | — |
| `national-news` | Ulusal gündem RSS | 5m | `0 */1 * * *` | — |
| `breaking-news` | Son dakika + acil kaynaklar | 2m | `*/20 * * * *` | — |
| `gundem` | Google News TR + AA kategori | 5m | `*/30 * * * *` | — |
| `world-news` | Uluslararası ajanslar | 5m | `5 * * * *` | — |
| `tech-news` | TechCrunch, Verge, ShiftDelete… | 10m | `10 * * * *` | — |
| `hackernews` | HN beststories (score≥150) | 10m | `technology` cron ile paylaşımlı | Ayrı cron yok |
| `sports-news` | Fanatik, Fotomaç, TRT Spor… | 5m | `*/30 * * * *` | — |
| `health-news` | WHO, sağlık RSS | 15m | `35 * * * *` | — |
| `politics-news` | ANKA, T24 siyaset | 5m | `0 * * * *` | — |
| `magazine-news` | Magazin / kültür | 15m | `30 */4 * * *` | — |
| `sinema-news` | Box Office Türkiye Atom | 4h | `45 */4 * * *` | — |
| `gastronomi-news` | Lezzet, gastronomi RSS | 30m | `15 */4 * * *` | — |
| `otomobil-news` | Otomobil RSS | 30m | `45 */4 * * *` | — |
| **`turizm-news`** | Turizm sektör RSS | 30m | `*/30 * * * *` | — |
| **`gezi-news`** | Seyahat / destinasyon | 1h | `50 * * * *` | — |
| `kibris-haberleri` | KKTC kaynakları | 30m | `0 * * * *` | — |
| `finans` | BloombergHT, Dünya… | 30m | `0 * * * *` | — |
| `kripto` | CoinDesk, CoinTelegraph | 30m | `20 * * * *` | — |
| `entertainment` | Magazin/eğlence birleşik | 1h | `0 */4 * * *` | — |
| `freenews` | FreeNewsAPI TR | 30m | `0 * * * *` | — |

### Özel ingest (tam içerik scraping)

| ID | Rol | Cron | Sorun |
|----|-----|------|-------|
| `aa-content` | aa.com.tr gündem tam içerik | `40 * * * *` | — |
| `anka-breaking` | Anka son dakika | `*/30 * * * *` | — |
| `anka-local` | Anka yerel (06/16/18/00 TRT) | `0 3,13,15,21 * * *` | — |
| `sozcu-breaking` | Sözcü son dakika scrape | `0 * * * *` | — |
| `afad-deprem` | AFAD M4.0+ deprem | `*/15 * * * *` | — |

### Sözcü dikey worker'ları

| ID | Kategori | Cron |
|----|----------|------|
| `futbol-sozcu` | futbol | `5 * * * *` |
| `basketbol` | basketbol | `25 */2 * * *` |
| `voleybol` | voleybol | `15 */2 * * *` |
| `borsa` | borsa | `0 */3 * * *` |
| `bilim-teknoloji` | bilim / teknoloji | `45 */3 * * *` |
| `saglik-sozcu` | sağlık | `55 */4 * * *` |

### Pipeline içi bileşenler (cron yok — `process-queue` ile)

| ID | Rol | Sorun |
|----|-----|-------|
| `fact-checker` | confidenceScore; düşükse newsDrafts | Beklenen — pipeline adımı |
| `category-engine` | AI kategori ataması | Beklenen |
| `geo-engine` | il/ilçe çıkarımı | Beklenen |
| **`chief-editor`** | Ana editör — duplikat/kategori/yayın kararı | Registry + AI Editörler UI (pipeline bölümü) |

### Bakım / yardımcı worker'lar

| ID | Rol | Cron | Sorun |
|----|-----|------|-------|
| `trend` | Google Trends | `50 */3 * * *` | — |
| `influencer` | Influencer araştırma | `0 */8 * * *` | — |
| `event` | Etkinlik senkron | daily `0 21 * * *` | — |
| `archive` | Eski haber arşivi | `0 2 * * *` | — |
| `seo-maintenance` | Slug/SEO tamamlama | `0 4 * * *` | — |
| `thin-content-backfill` | Kısa içerik yeniden yazım | `30 2,14 * * *` | — |
| `weather` | Büyük iller hava durumu | `0 */2 * * *` | — |
| `video-queue` | Video kuyruğa ekleme | `0 */6 * * *` | — |
| `video-process` | AI video senaryo | `25 */3 * * *` | — |
| **`recategorize`** | Düşük güven kategori düzeltme | daily | `0 3 * * *` → `/api/admin/recategorize` (CRON_SECRET) |
| `world-cup-2026` | Dünya Kupası (arşiv) | off | Ingest kapalı — bilinçli |

### Kuyruk / altyapı cron'ları (worker değil)

| Path | Rol | Schedule |
|------|-----|----------|
| `/api/cron/newsroom/process-queue` | newsQueue işleme | `*/15 * * * *` |
| `/api/cron/newsroom/draft-reprocess` | Düşük güven taslak yeniden işleme | `0 */6 * * *` |
| `/api/cron/newsroom/queue-purge` | Eski kuyruk temizliği | `20 * * * *` |
| `/api/cron/editorial-review` | Pending haber duplikat incelemesi | `0 */3 * * *` |

---

## AI Persona editörleri (`aiEditors` Firestore)

Kaynak: `src/lib/ai/editorial/seedEditors.ts` — Admin → **AI Editörler** sayfası.

| Slug | Rol / Masa | Kategoriler | Not |
|------|------------|-------------|-----|
| `selin-aras` | Genel Yayın AI Editörü | gundem, trend | Senior editor, fallback hedefi |
| `arda-sahin` | Son Dakika | son-dakika, asayis | Breaking editor |
| `ece-yalin` | Gündem & Kamu | gundem | Desk editor |
| `mert-karaca` | Politika | siyaset | — |
| `defne-aksoy` | Dünya | dunya | — |
| `kerem-aydin` | Ekonomi / Finans | finans-piyasa, borsa, ekonomi | — |
| `deniz-erdem` | Spor | futbol, basketbol, voleybol… | — |
| `can-tunc` | Teknoloji | teknoloji, bilim | — |
| `leyla-arin` | Sağlık | saglik | — |
| `ipek-demir` | Magazin | magazin | — |
| `melis-kaya` | Yerel (Çanakkale) | yerel-* alt kategoriler | localConfig: ilçeler |
| `asli-tan` | Kültür / Sinema | sinema, kultur | — |
| `derya-akin` | Turizm | turizm | Worker cron aktif (turizm-news) |
| `emre-sancar` | Gastronomi | gastronomi | — |
| `zeynep-er` | Otomobil | otomobil | — |
| `baran-eren` | Kıbrıs | kibris-haberleri | — |
| `burak-celik` | Gezi | gezi | Worker cron aktif (gezi-news) |
| `oguz-ata` | Astroloji | astroloji | — |
| `nahaber-redaksiyon` | İç redaksiyon | — | assignableForNews: false |
| `nahaber-seo` | SEO kopya | — | Internal agent |
| `nahaber-dogrulama` | Doğrulama | — | Internal agent |
| `alp-ersoy` | Köşe yazarı | çeşitli | Columnist |
| `derin-akal` | Köşe yazarı | çeşitli | — |
| `koray-demir` | Köşe yazarı | çeşitli | — |
| `lara-yaman` | Köşe yazarı | çeşitli | — |
| `eda-sonmez` | Köşe yazarı | çeşitli | — |
| `deniz-alp` | Köşe yazarı | çeşitli | — |

Persona editörler **RSS worker değildir** — pipeline rewrite aşamasında haber tarzı / masa seçimi için kullanılır.

---

## Chief Editor durumu

| Özellik | Durum |
|---------|-------|
| Kod | `src/services/newsroom/chiefEditor.ts` — pipeline final gate |
| Duplikat | `isDuplicate` → `createDuplicateNewsStub`, yayın yok |
| Kategori | DeepSeek V4 + tüm `DEFAULT_CATEGORIES` |
| Auto-publish | `CHIEF_EDITOR_AUTO_PUBLISH` env (varsayılan açık) |
| Registry | `EDITOR_REGISTRY['chief-editor']` — schedule: `pipeline` |
| Admin UI | AI Editörler → **Pipeline bileşenleri** bölümünde görünür |
| Fallback | API key yoksa `chiefEditorFallback` — duplikat kontrolü **devre dışı** |

**Shipped:** Pipeline'da aktif; registry + AI Editörler UI'da pipeline bileşeni olarak listelenir.

---

## Düzeltmeler (12 Ağustos 2026 — deploy)

| Madde | Yapılan |
|-------|---------|
| P1 turizm/gezi cron | `vercel.json`: turizm `*/30`, gezi `50 * * * *` |
| P2 recategorize cron | Günlük `0 3 * * *` → `/api/admin/recategorize` (GET + CRON_SECRET) |
| P2 chiefEditor UI | `chief-editor` registry + AI Editörler pipeline listesi |
| P0 Tekrar Haber | Önceki commit — `listDuplicateNews` |

---

## Eksik / kırık editör özeti

| Öncelik | Bileşen | Sorun | Öneri |
|---------|---------|-------|-------|
| P0 | Tekrar Haber CMS filtresi | newsDrafts rejected stub'ları sorgulanmıyordu | **Düzeltildi** (`listDuplicateNews`) |
| P1 | `turizm-news` | Cron yoktu | **Düzeltildi** — vercel cron |
| P1 | `gezi-news` | Cron yoktu | **Düzeltildi** — vercel cron |
| P2 | `recategorize` | Günlük cron yoktu | **Düzeltildi** — `0 3 * * *` |
| P2 | `chiefEditor` | Registry/UI dışıydı | **Düzeltildi** — `chief-editor` + UI |
| P3 | `aiNewsEditor` duplikat | Stub yok, sadece throw | chiefEditor/queue yolu yeterli; isteğe bağlı stub |
| P3 | `world-cup-2026` | Ingest kapalı | Bilinçli arşiv |

---

## Test planı

1. CMS → Haberler → **Tekrar Haber** — duplikat stub'ları listelenmeli (`categoryId: tekrarlayan`, turuncu "Tekrar" rozeti).
2. Yeni duplikat: aynı RSS öğesini iki kaynaktan kuyruğa al → `newsDrafts` stub + filtrede görünürlük.
3. Chief editor duplikat: benzer başlıklı haber → stub, yayın yok.
4. `editorial-review` cron: pending + `isDuplicate: true` haberler filtede görünmeli.
