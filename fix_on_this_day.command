#!/bin/bash
cd "$(dirname "$0")"
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null

git add \
  src/app/api/news/on-this-day/route.ts \
  vercel.json

git commit -m "fix: Tarihte Bugün — canlı Wikipedia fallback + 00:01 cron [deploy]

- on-this-day/route.ts: Firestore boşsa Wikipedia'dan anında çek ve kaydet
- vercel.json: on-this-day cron 01:00 UTC → 00:01 UTC"

git push
echo "✅ Push tamamlandı."
