# Maliyet Artış Analizi ($1 → $5/gün)

**Proje:** NaHaberApp  
**Dönem:** Ağustos 2026  
**Kapsam:** GCP + Vercel

## Özet

Günlük maliyet yaklaşık **$1/gün** seviyesinden **~$5/gün**'e çıktı (~5x artış). En büyük sürücü **9 Ağustos**'taki `process-queue` değişikliğidir (10x etki, maliyet payının ~%35–45'i). OG/Satori cache bypass ve mevcut Firestore tabanı ikincil katkı sağlar.

| Metrik | Değer |
|--------|-------|
| Önceki günlük maliyet | ~$1/gün |
| Güncel günlük maliyet | ~$5/gün |
| Artış çarpanı | ~5x |

## Sıralı maliyet sürücüleri

| # | Kaynak | Etki | Tahmini pay | Detay |
|---|--------|------|-------------|-------|
| 1 | process-queue | 10x | 35–45% | 9 Ağu: `*/15`→`*/5`, batch 16→50 → **288 çalışma/gün** |
| 2 | OG / Satori | Yüksek | 20–30% | `?v=timestamp` ile cache bypass — her istek yeniden render |
| 3 | Firestore | Orta-yüksek | 15–20% | Okuma/yazma hacmi; Temmuz'da NaHaberApp ~$5/gün taban |
| 4 | Social + DeepSeek | Orta | 10–15% | Sosyal medya otomasyonu ve AI içerik üretimi |
| 5 | 55 cron job | Düşük-orta | 5–10% | Dağınık zamanlanmış görevler |
| 6 | Vercel builds | Düşük | ~5% | Deploy/build dakikaları |

## Kritik bulgu: process-queue (9 Ağustos)

| Parametre | Önce | Sonra |
|-----------|------|-------|
| Cron sıklığı | `*/15` dk | `*/5` dk |
| Batch boyutu | 16 | 50 |
| Günlük çalışma | ~96 | **288** |
| Maliyet etkisi | 1x | ~10x |

Sıklık 3x, batch ~3x — birleşik etki process-queue maliyetini yaklaşık 10 katına çıkardı.

## OG / Satori cache bypass

OG görselleri `?v=timestamp` query parametresi ile sunuluyor; CDN ve tarayıcı cache'i devre dışı kalıyor. Her sosyal paylaşım ve bot isteği Satori render'ını yeniden tetikliyor — tahmini pay **%20–30**.

## Azaltma önerileri

| Öncelik | Önlem | Detay |
|---------|-------|-------|
| P0 | process-queue throttle | Cron sıklığını `*/5`→`*/15`'e geri al veya batch boyutunu düşür; 288/gün yerine ~96/gün hedefle |
| P0 | OG cache düzeltmesi | `?v=timestamp` kaldır; statik OG görselleri CDN/cache ile sun |
| P1 | Social AI yeniden kullanım | DeepSeek çıktılarını cache'le; tekrarlayan sosyal gönderilerde aynı sonucu kullan |
| P2 | Cron konsolidasyonu | 55 cron'u gözden geçir; birleştirilebilir görevleri tek endpoint'e topla |

## Kapsam notları

- **BosphorusVibe** ayrı bir proje olarak faturalandırılıyor; bu analize dahil değil.
- **Temmuz Firestore** — NaHaberApp Firestore maliyeti Temmuz'da zaten ~$5/gün tabanına ulaşmıştı; Ağustos artışı bu tabanın üzerine ek yük getirdi.
