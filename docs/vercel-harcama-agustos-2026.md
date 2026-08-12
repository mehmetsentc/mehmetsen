# Vercel harcama analizi — Ağustos 2026 ($97.52)

**Proje:** NaHaber (`nahaber.com`)  
**Tetikleyici:** `failed-payments@vercel.com` — Mastercard …3573 için **$97.52** tahsilat başarısız  
**Tarih:** 13 Ağustos 2026  
**Canvas:** [`vercel-harcama-agustos-2026.canvas.tsx`](/Users/user/.cursor/projects/Users-user-nahaber-canakkale-nahaber/canvases/vercel-harcama-agustos-2026.canvas.tsx)  
**Önceki (GCP+Vercel karma):** [`docs/maliyet-artis-analizi.md`](./maliyet-artis-analizi.md)

## Özet

$97.52, Vercel’in tahsil etmeye çalıştığı dönem faturasıdır. Ana neden büyük olasılıkla **Pro tabanı + Fluid Compute overage**’dır: 9 Ağustos’taki `process-queue` hızlandırması (`*/5`, batch 50) kısa sürede ~10x fonksiyon yükü üretti; 10 Ağustos throttle’ına rağmen fatura penceresi spike’ı kapsıyor.

**13 Ağu P0 deploy (bu belge):** cron ~1067 → **~733 çağrı/gün** (−31%); bellek **20×1024MB → 10×1024 + 10×512**; ISR `/canli` 30→120, `/kategori`+`/yerel`+`/events` 60→180. `process-queue` `*/15` + batch 20 korundu.

> **Usage okuma:** `cursor-ide-browser` MCP bu oturumda yok. `vercel open` ile dashboard açıldı; `vercel usage` API **500**; Observability Plus metrics projede kapalı (`payment_required`). Satır tutarları hâlâ tahmini — Dashboard → Usage ile doğrulayın. Ödeme yöntemi değiştirilmedi.

## Vercel ≠ GCP

| Fatura | Ne içerir | Bu $97.52? |
|--------|-----------|------------|
| **Vercel** | Pro, Fluid Compute, Edge, Fast Data Transfer, Image Optimization, ISR, builds | Evet |
| **GCP / Firebase** | Firestore okuma/yazma, Storage, Cloud Functions vb. | Hayır — ayrı fatura |
| DeepSeek / sosyal API | AI + sosyal otomasyon | Hayır — ayrı |

Önceki `maliyet-artis-analizi.md` (~$5/gün) **GCP + Vercel** karışımıydı. Bu belge yalnızca Vercel $97.52’ye odaklanır.

## Kod kanıtı — maliyet sürücüleri (önceki durum)

### 1. Fluid Compute — cron + uzun worker’lar (birincil)

`vercel.json` (13 Ağu, P0 öncesi):

| Metrik | Önce | P0 sonrası |
|--------|------|------------|
| Cron sayısı | **58** | **58** |
| Tahmini çağrı/gün | **~1067** | **~733** |
| 1024MB fonksiyon | **20** | **10** (+10×512MB) |
| Tipik `maxDuration` | 120–300 sn | aynı |

Korunan sık job’lar:

| Çağrı/gün | Schedule | Path |
|-----------|----------|------|
| 96 | `*/15` | `process-queue` |
| 72 | `*/20` | `breaking`, `afad` |
| 48 | `10,40 * * * *` | `ai-pipeline` |
| 24 | saatlik | `gundem`, `turizm`, `sports`, `anka-breaking`, `local`, `expire-breaking` |

### 2. process-queue spike (9 → 10 Ağu)

| | 9 Ağu (`31dbb23`) | 10 Ağu throttle (`f5373ef`) | Şimdi (P0) |
|--|-------------------|-----------------------------|-------------|
| Cron | `*/5` (288/gün) | `*/15` (96/gün) | `*/15` (korundu) |
| Batch | 50 | 20 (default) | 20 |
| Etki | ~10x | kısmi geri alma | ekosistem seyrekleştirildi |

### 3. OG / Satori

- Route’lar: `/api/og/story/[id]`, `/api/og/social/[id]` (`runtime = 'nodejs'`, `ImageResponse`)
- 10 Ağu: `ogCacheVersion.ts` — **stable content hash** + `s-maxage=86400` (`f5373ef`)
- P0: cache kodu doğrulandı; değiştirilmedi (zaten etkili)

### 4. Edge / middleware / ISR / images

- `middleware.ts`: API’yi skip ediyor (iyi); yine de **tüm sayfa** isteklerinde çalışır
- ISR (P0): `/canli` **120s**, `/kategori` **180s**, `/yerel` **180s**, `/events` **180s**
- `next/image`: remotePatterns + AVIF/WebP → Image Optimization (manuel izleme)

### 5. Build dakikaları

Ağustos başı–13’ü arasında yaklaşık **256 `[deploy]`** commit — sık prod build, Build Minutes overage riski. (Manuel: preview’da biriktir.)

## Tahmini fatura dağılımı (~$97) — Usage doğrulanamadı

| Kalem | Tahmini $ | Pay | Güven |
|-------|-----------|-----|-------|
| Fluid Compute (cron + OG + API) | ~$41 | ~42% | Orta — kod güçlü, Usage 500 |
| Pro plan / seat | ~$20 | ~20% | Orta |
| Fast Data Transfer + Edge Requests | ~$18 | ~18% | Düşük–orta |
| Image Optimization + ISR | ~$12 | ~12% | Düşük–orta |
| Build minutes | ~$8 | ~8% | Orta (deploy hacmi) |

## Uygulanan P0 (13 Ağu 2026) — kod

| Önlem | Yapılan | Beklenen etki |
|-------|---------|---------------|
| Non-kritik cron seyrekleştir | turizm/anka/sports/gundem saatlik; secondary desk’ler `*/2`–`*/6`; afad `*/20` | ~1067→~733 çağrı/gün (−31%); **−20–35% Fluid invocations** |
| 1024MB daralt | Hafif: events/sync, paribu, boxoffice, sinema, national, gundem, local, backfill-*, recategorize → **512MB**. Ağır: process-queue, AI, video, archive, breaking → **1024MB** | **−15–25% Fluid memory $** |
| OG cache | Mevcut stable hash + `s-maxage=86400` korundu | Miss yoksa ek kazanç sınırlı |
| ISR uzat | `/canli` 30→120; kategori/yerel/events 60→180 | **−ISR writes / Edge regen** |

## Hâlâ manuel / P1–P2

1. **Kart güncelle** — $97.52 tahsilatı için (ödeme ayarına dokunulmadı).
2. **Usage Dashboard** — Fluid / Edge / Image / ISR / Build satır tutarlarını doğrula (`vercel usage` API şu an 500).
3. **Deploy frekansı** — preview’da biriktir; prod’a daha az `[deploy]`.
4. **P2** — uzun worker’ları Cloud Scheduler + Cloud Run’a taşı (maliyet Vercel→GCP kayar).

## İlgili commit’ler

- `254cdec` / `d35e9af` — erken Ağustos cost kesintileri  
- `31dbb23` — queue 3x boost (maliyet spike)  
- `f5373ef` — process-queue throttle + OG cache  
- `b5998c6` — turizm/gezi/recategorize cron ekleri  
- *(bu P0 deploy)* — cron/memory/ISR throttle  

## Browser / CLI bulguları (13 Ağu oturumu)

| Kaynak | Sonuç |
|--------|--------|
| `cursor-ide-browser` MCP | Kurulu değil / çağrılamadı |
| `vercel whoami` | `mehmetsentc` · team `shenteam1` · project `nahaber` |
| `vercel open` | `https://vercel.com/shenteam1/nahaber` açıldı |
| `vercel usage` | **HTTP 500** — satır tutarı alınamadı |
| `vercel metrics` | Observability Plus projede hariç (`payment_required`) |
| Ödeme ayarları | Okuma dışı; değiştirilmedi |
