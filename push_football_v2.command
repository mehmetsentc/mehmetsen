#!/bin/bash
cd "$(dirname "$0")"

git add \
  src/services/footballService.server.ts \
  src/app/api/football/standings/route.ts \
  src/app/api/football/fixtures/route.ts \
  src/app/api/cron/football-sync/route.ts \
  src/components/football/FootballPage.tsx \
  src/components/football/FootballWidget.tsx

git commit -m "feat: futbol genişletme — 4 lig, geçmiş/yaklaşan maçlar, 2 sezon [deploy]

- 4 lig: Süper Lig (203), TFF 1. Lig (204), TFF 2. Lig (205), TFF 3. Lig (206)
- Yeni endpoint: getPastFixtures — son 20 tamamlanan maç, 6 saat cache
- Cron: 4 lig × 4 endpoint = 16 API isteği/gün (100 limitinde güvenli)
- FootballPage: lig sekmeler + Bugün/Yaklaşan/Geçmiş/Puan Tablosu + sezon picker (2024-25 / 2025-26)
- API routes: league + season query param desteği eklendi
- FootballWidget: league=203 explicit param"

git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Push tamamlandı — Vercel deploy başlayacak"
echo ""
echo "📌 FOOTBALL_API_KEY Vercel'e eklenmemişse puan tablosu çalışmaz"
echo "📌 İlk veriyi çekmek için:"
echo "   https://nahaber.com/api/cron/football-sync?secret=CRON_SECRET"
