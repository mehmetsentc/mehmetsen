#!/bin/bash
cd "$(dirname "$0")"

# Lock dosyası varsa temizle
rm -f .git/HEAD.lock .git/objects/maintenance.lock 2>/dev/null

git add \
  src/app/api/cron/on-this-day/route.ts \
  src/app/api/news/on-this-day/route.ts \
  src/components/home/OnThisDayArchive.tsx \
  src/services/newsService.server.ts \
  vercel.json

git commit -m "feat: tarihte bugün — Wikipedia TR kaynağı entegrasyonu

- /api/cron/on-this-day: her gün 01:00 UTC Wikipedia TR API'den çeker
- /api/news/on-this-day: Firestore onThisDayEvents'ten okur
- OnThisDayArchive: yıl + olay metni + Wikipedia linki gösterir
- vercel.json: günlük cron (0 1 * * *) eklendi
- newsService: getOnThisDayNews önceki yıllar filtresi"

git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Push tamamlandı! Vercel deploy edecek."
echo ""
echo "📌 İlk kez veri doldurmak için şu URL'yi ziyaret et:"
echo "   https://nahaber.com/api/cron/on-this-day?secret=CRON_SECRET_DEGERI"
