#!/bin/bash
cd "$(dirname "$0")"

# Lock dosyası varsa temizle
rm -f .git/HEAD.lock .git/objects/maintenance.lock 2>/dev/null

git add \
  src/services/museumService.server.ts \
  src/app/api/museums/cities/route.ts \
  src/app/api/museums/route.ts \
  src/app/\(main\)/muzeler/page.tsx \
  src/components/museums/MuseumBrowser.tsx

git commit -m "feat: Türkiye müzeleri bölümü — NosyAPI entegrasyonu

- museumService.server.ts: NosyAPI fetch + Firestore cache (30 gün)
- /api/museums/cities: şehir listesi (0 kredi, 30 gün cache)
- /api/museums: şehre göre müzeler (Firestore cache, kredi tasarrufu)
- /muzeler: müze rehberi sayfası
- MuseumBrowser: şehir dropdown + müze arama + kart listesi"

git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Push tamamlandı! Vercel deploy edecek."
echo ""
echo "📌 Unutma: Vercel'e NOSYAPI_KEY ekle:"
echo "   https://vercel.com/nahaber-team/nahaber/settings/environment-variables"
echo "   Key: NOSYAPI_KEY"
echo "   Value: TfyM71I56ETRxsCktLxJPhjcQjNYJolkcTmOxwuEoaMFPMc60p2XbjeDJwqP"
