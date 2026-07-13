#!/bin/bash
cd "$(dirname "$0")"

git add src/app/api/geo/detect/route.ts
git commit -m "fix: geo/detect — req.ip kaldırıldı (NextRequest type hatası) [deploy]"
git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Fix push edildi, Vercel deploy başlayacak."
