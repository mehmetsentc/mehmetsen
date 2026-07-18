#!/bin/bash
cd "$(dirname "$0")"
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null

git add "src/components/home/MobileMagazineFeed.tsx"

git commit -m "feat: mobil akış 2-kolon grid → tek sütun liste (Sözcü stili) [deploy]

- MobileMagazineFeed: grid-cols-2 kaldırıldı
- Tam genişlik 16/9 görsel
- Kategori etiketi + başlık altında
- Skeleton loading da güncellendi"

git push
echo "Push tamamlandi."
