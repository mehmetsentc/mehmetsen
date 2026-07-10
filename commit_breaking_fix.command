#!/bin/bash
cd "$(dirname "$0")"

rm -f .git/index.lock

git add \
  src/app/api/admin/news/\[id\]/route.ts \
  src/app/api/cron/newsroom/expire-breaking/route.ts

git status --short

git commit -m "feat: son dakika toggle — kendi kategorisinde + hikaye bölümünde göster, 24h sonra kendi kategorisine döndür

- admin/news/[id]/route.ts:
  * isBreaking otomatik reset kaldırıldı (kategori değişince breaking artık kapanmıyor)
  * isBreaking=true → originalCategoryId sakla (expire sırasında geri dönmek için)
  * isBreaking=false → originalCategoryId varsa categoryId'ye geri yükle

- cron/expire-breaking/route.ts:
  * 24h sonra haber originalCategoryId'ye döner (eskiden daima 'gundem'e gidiyordu)
  * originalCategoryId yoksa mevcut kategori korunur; son-dakika pipeline haberleri gundem'e gider
  * originalCategoryId alanı expire sonrası temizlenir"

git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Push tamamlandı — Vercel deploy başlıyor."
echo ""
echo "Davranış:"
echo "  isBreaking=true  → haber hem kendi kategorisinde hem BreakingStories'de"
echo "  24 saat sonra    → isBreaking=false, haber SADECE kendi kategorisinde"
read -p "Kapatmak için Enter'a bas..."
