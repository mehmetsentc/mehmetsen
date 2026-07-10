#!/bin/bash
cd "$(dirname "$0")"

# Lock dosyasını temizle
rm -f .git/HEAD.lock .git/index.lock 2>/dev/null

# Stage ve commit
git add src/app/admin/news/page.tsx \
        src/app/api/admin/news/\[id\]/route.ts \
        src/components/admin/AdminNewsForm.tsx

git commit -m "feat: slug düzenleme + form paritesi (özet alanı, edit slug)"

git push origin main

echo ""
echo "✅ Push tamamlandı — Vercel deploy başlayacak."
read -p "Kapatmak için Enter'a bas..."
