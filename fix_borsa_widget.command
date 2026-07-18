#!/bin/bash
cd "$(dirname "$0")"
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null

git add \
  src/app/api/finance/bist/route.ts \
  src/components/widgets/BorsaWidget.tsx \
  src/app/api/news/on-this-day/route.ts \
  vercel.json

git commit -m "fix: Borsa widget → Yahoo Finance + Tarihte Bugün canlı fallback [deploy]

- api/finance/bist/route.ts: Yeni endpoint — BIST endeksleri, hisseler, döviz, emtia
  Yahoo Finance v7 batch sorgusu ile (TradingView gereksiz)
- BorsaWidget.tsx: Tamamen yeniden yazıldı — TradingView kaldırıldı
  3 endeks kartı (XU100/XU030/XBANK) + tab tablosu (Hisseler/Döviz/Emtia)
  Her 60 saniyede otomatik yenileme + manuel yenile butonu
- on-this-day/route.ts: Firestore boşsa Wikipedia'dan anında çek
- vercel.json: on-this-day cron 01:00 → 00:01 UTC"

git push
echo "✅ Push tamamlandı."
