#!/bin/bash
cd "$(dirname "$0")"

rm -f .git/index.lock

git add \
  src/constants/cities.ts \
  src/components/admin/AdminNewsForm.tsx \
  "src/app/api/admin/news/[id]/route.ts" \
  src/services/adminNewsService.ts \
  src/services/postService.ts

git status --short

git commit -m "feat: haber formunda şehir+ilçe seçimi (tüm kategoriler) + yerel akışta çift görünüm

- cities.ts: DISTRICT_DISPLAY_NAMES + getDistrictsForProvince() eklendi
- AdminNewsForm: şehir seçimi artık tüm kategorilerde isteğe bağlı
  * Dropdown: 81 il listesi (TURKISH_PROVINCES)
  * İl seçilince ilgili ilçeler dropdown'u açılır (isteğe bağlı)
  * Edit modu artık API route üzerinden (Admin SDK) → isBreaking korunur
- admin/news/[id]/route.ts: districtSlug + district alanları eklendi
- adminNewsService: citySlug + districtSlug parametreleri eklendi
- postService.createNews: citySlug/districtSlug doğrudan kaydediliyor

Sonuç: şehir seçili haber hem kendi kategorisinde hem yerel şehir akışında görünür"

git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Push tamamlandı — Vercel deploy başlıyor."
echo ""
echo "Yeni özellikler:"
echo "  • Şehir seçimi: tüm kategorilerde isteğe bağlı (81 il dropdown)"
echo "  • İlçe seçimi: il seçilince ilçe dropdown'u açılır (isteğe bağlı)"
echo "  • Şehir seçili haber hem kendi kategorisinde hem yerel akışta görünür"
read -p "Kapatmak için Enter'a bas..."
