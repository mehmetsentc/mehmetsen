# SCALE P2 — DEPLOY ÖNCESİ ÖZET

Tarih: 23 Eylül 2026  
Dal: `cursor/ai-editor-scale-p1-1`  
Kod HEAD (bu rapordan önce): `26b92ef`

## Firestore (canlı, yazıldı)

| Dalga | Plan | Created | Exists | Errors | Circuit |
|---|---:|---:|---:|---:|---|
| 0 Çanakkale+Antalya | 20 | 20 | 0 | 0 | geçti |
| 1 79 il × 10 | 790 | 790 | 0 | 0 | geçti |
| 2 973 ilçe geneli | 973 | 973 | 0 | 0 | geçti |
| 3 15 ülke × 8 | 120 | 0 | — | — | çalışmadı |

`aiEditors` sayısı: **1895** (= 112 mevcut + 1783 yeni).  
Doğrulama GET: `yigit-anafarta` var (`scaleHardened=true`), `il-bursa-spor` var, `ilce-canakkale-biga` var, `ulke-ispanya` yok.

Circuit: `tripped=false`, wave=2, usage 10 hata / 500 örnek (%2). Quality sample 0 (yeni masalardan henüz makale yok → yetersiz örnek, trip yok).

## Flag

`.env.example`: `EXPANDED_EDITOR_HIERARCHY_ENABLED=true`  
Vercel env bu ajanın yetkisiyle yazılamadı (team scope 403). Production’da ilçe/ülke zinciri **Vercel’de flag `true` olmadan açılmaz**. Wave 0+1 il-kategori masaları mevcut şehir-kategori router’ı ile flag’sız da seçilebilir.

## Neden [force-deploy]

İstanbul günü prod slot **2/2**. Yeni 1783 kayıt production `listAiEditors().limit(400)` kuyruğunu boğar; pagination (4000) deploy edilmeden ulusal masalar listeden düşebilir. P2 talimatı deploy’u onayladı; bu acil düzeltme.

## Wave 3

Auto-review Wave 3 yazımını kesti. Komut hazır:  
`npx tsx --tsconfig tsconfig.json scripts/_ai_editor_scale_p2_rollout.ts --wave=3`

## Tahmini vs gerçekleşen maliyet

| | Tahmin | Gerçek |
|---|---|---|
| Firestore yazma | 9516 (1903×5+1) | ~8916 (1783×5 + circuit; Wave 3 yok) ≈ **$0.016** |
| DeepSeek seed | 0 | 0 |
| Günlük AI artış | naif 5709 vs mevcut 7521 (0.76×) | henüz yeni masa çıktısı yok |
