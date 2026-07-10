#!/bin/bash
cd "$(dirname "$0")"

# Remove stuck lock file if exists
rm -f .git/index.lock

# Stage all cost-optimization files
git add \
  src/lib/sitemap/mainSitemap.ts \
  src/app/sitemap/[id]/route.ts \
  src/app/sitemap.xml/route.ts \
  src/hooks/useWebVitals.ts \
  src/hooks/useTrackPageview.ts \
  src/components/layout/AnalyticsTracker.tsx \
  src/app/api/analytics/vitals/route.ts \
  src/app/api/analytics/track/route.ts \
  src/app/admin/analytics/page.tsx \
  src/app/layout.tsx \
  src/lib/firebase/collections.ts

git status --short

git commit -m "perf: Firestore maliyet optimizasyonu — sitemap OFFSET→zaman aralığı + 24h cache + Speed Insights

- mainSitemap.ts: OFFSET pagination yerine publishedAt zaman aralığı kullan
  * Her sayfa sadece o haftanın haberlerini okur (eskiden 20k+ dok tarıyordu)
  * .select() ile sadece slug/publishedAt/updatedAt çek
  * Tahmini tasarruf: aylık ₺9.500 → ₺300
- sitemap/[id]/route.ts + sitemap.xml/route.ts: revalidate 3600→86400 (24h)
- Speed Insights: useWebVitals hook + vitals API + admin dashboard tablosu
- Analytics: useTrackPageview + AnalyticsTracker + track API + Firestore collections"

git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Push tamamlandı — Vercel deploy başlıyor."
echo ""
echo "Beklenen maliyet düşüşü:"
echo "  Önceki: ~₺9.500/ay (55M Firestore okuma)"
echo "  Sonraki: ~₺200-400/ay (sadece gerçekten okunan dokümanlar)"
read -p "Kapatmak için Enter'a bas..."
