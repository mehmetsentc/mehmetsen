#!/bin/bash
cd "$(dirname "$0")"

git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Push tamamlandı — Vercel deploy başlayacak"
echo ""
echo "📌 Deploy tamamlandıktan sonra cron'u çalıştır:"
echo "   https://nahaber.com/api/cron/football-sync?secret=CRON_SECRET"
