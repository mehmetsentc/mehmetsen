#!/bin/bash
cd "$(dirname "$0")"

git add \
  src/services/footballService.server.ts \
  src/components/football/FootballPage.tsx

git commit -m "fix: football — 3.Lig ID 206→552 (Grup 1), last/next→from/to [deploy]

- League 206 = Türkiye Kupası, doğru 3.Lig = 552 (Group 1)
- getPastFixtures: last= kaldırıldı, sezon bitiş aralığı (Mart-Temmuz) kullanılıyor
- getUpcomingFixtures: next= kaldırıldı, from=bugün to=60gün sonra kullanılıyor"

git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Push tamamlandı — Vercel deploy başlayacak (~2 dk)"
echo ""
echo "Deploy bittikten sonra cron'u çalıştır:"
echo "https://nahaber.com/api/cron/football-sync?secret=5b729ac0e4bee32fca289d6f2e8c3317e1eafcdb952d7284dc2f8a682dea8779"
