#!/bin/bash
cd "$(dirname "$0")"

rm -f .git/HEAD.lock .git/objects/maintenance.lock 2>/dev/null

git add \
  src/services/footballService.server.ts \
  src/app/api/cron/football-sync/route.ts \
  src/app/api/football/standings/route.ts \
  src/app/api/football/fixtures/route.ts \
  "src/app/(main)/futbol-canli/page.tsx" \
  src/components/football/FootballWidget.tsx \
  src/components/football/FootballPage.tsx \
  src/components/home/HomeFeed.tsx \
  src/components/layout/Sidebar.tsx \
  src/components/layout/MobileNav.tsx \
  src/constants/routes.ts \
  vercel.json

git commit -m "feat: Süper Lig canlı skor, puan tablosu + navigasyon entegrasyonu

- footballService.server.ts: Firestore cache ile API-Football fetch
- /api/cron/football-sync: her gün 06:00 UTC, 3 API isteği
- /api/football/standings + /api/football/fixtures: veri endpointleri
- /futbol-canli: puan tablosu + maç sayfası
- FootballWidget: ana sayfa feed'ine eklendi (OnThisDayArchive altı)
- Sidebar: Süper Lig + Müzeler linkleri eklendi
- MobileNav: Spor butonu → /futbol-canli olarak güncellendi
- routes.ts: FOOTBALL + MUZELER + isPublicRoute güncellendi
- vercel.json: günlük football-sync cron eklendi"

git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Push tamamlandı!"
echo ""
echo "📌 ZORUNLU — FOOTBALL_API_KEY Vercel'e eklenecek:"
echo "   1. https://dashboard.api-football.com/register → ücretsiz kayıt"
echo "   2. https://vercel.com/shenteam1/nahaber/settings/environment-variables"
echo "      Key: FOOTBALL_API_KEY, Value: (aldığın key)"
echo ""
echo "📌 API key ekledikten sonra cron'u bir kez manuel çağır:"
echo "   https://nahaber.com/api/cron/football-sync?secret=CRON_SECRET_DEGERI"
