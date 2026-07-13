#!/bin/bash
cd "$(dirname "$0")"

git add src/services/footballService.server.ts

git commit -m "fix: football free plan — last/next yerine from/to date range [deploy]

- getPastFixtures: last= yerine from/to sezon bitiş aralığı (Mart-Temmuz)
- getUpcomingFixtures: next= yerine from=bugün&to=60gün sonra"

git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Push tamamlandı — Vercel deploy başlayacak (~2 dk)"
echo ""
echo "Deploy bittikten sonra cron'u çalıştır:"
echo "https://nahaber.com/api/cron/football-sync?secret=5b729ac0e4bee32fca289d6f2e8c3317e1eafcdb952d7284dc2f8a682dea8779"
