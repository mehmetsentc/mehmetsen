#!/bin/bash
cd "$(dirname "$0")"

rm -f .git/HEAD.lock .git/objects/maintenance.lock 2>/dev/null

echo "📦 Tüm bekleyen değişiklikler commit ediliyor..."

git add \
  src/services/museumService.server.ts \
  "src/app/api/museums/cities/route.ts" \
  "src/app/api/museums/route.ts" \
  "src/app/(main)/muzeler/page.tsx" \
  src/components/museums/MuseumBrowser.tsx \
  src/app/api/geo/detect/route.ts \
  src/components/home/LocationPermission.tsx

git commit -m "feat: Müze rehberi + IP Geolocation fallback

- museumService.server.ts: NosyAPI fetch + Firestore cache (30 gün)
- /api/museums/cities: şehir listesi (0 kredi)
- /api/museums: şehre göre müzeler (Firestore cache)
- /muzeler: müze rehberi sayfası (şehir dropdown + arama + kartlar)
- /api/geo/detect: IP tabanlı şehir tespiti (ip2location.io, key yok)
- LocationPermission: GPS reddedilince IP geo fallback devreye girer"

git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Push tamamlandı! Vercel deploy edecek."
echo ""
echo "📌 Müzeler için: https://nahaber.com/muzeler"
echo "📌 Unutma: Vercel'e NOSYAPI_KEY eklendi mi kontrol et"
