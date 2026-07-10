#!/bin/bash
cd "$(dirname "$0")"

# Remove stuck lock file
rm -f .git/index.lock

# Stage the new/changed analytics files
git add \
  src/hooks/useWebVitals.ts \
  src/hooks/useTrackPageview.ts \
  src/components/layout/AnalyticsTracker.tsx \
  src/app/api/analytics/vitals/route.ts \
  src/app/api/analytics/track/route.ts \
  src/app/admin/analytics/page.tsx \
  src/app/layout.tsx \
  src/lib/firebase/collections.ts

git commit -m "feat: Speed Insights + Firebase analytics — Core Web Vitals tracking & admin dashboard"

git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Push tamamlandı — Vercel deploy başlıyor."
read -p "Kapatmak için Enter'a bas..."
