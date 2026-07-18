#!/bin/bash
cd "$(dirname "$0")"
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null

git add \
  src/types/newsItem.ts \
  src/constants/config.ts \
  src/services/newsService.server.ts \
  src/components/home/desktop/DesktopHomeFeed.tsx

git commit -m "feat: Tarih kategorisi + hero Gündem + Trend Haberler fallback [deploy]

- types/newsItem.ts: 'tarih' HomeCategorySlug + HOME/FEED_PRIORITY_RAILS eklendi
- constants/config.ts: Tarih CategoryDef, nav, sidebar, admin grubu eklendi
- newsService.server.ts: gündem rail 12→20; bucketTrending 3 kademeli fallback
  (gerçek trend → düşük eşik → gündem fallback); limit 6→8
- DesktopHomeFeed.tsx: hero/topFour/quickHeadlines sadece Gündem rayinden"

git push
echo "✅ Push tamamlandı."
