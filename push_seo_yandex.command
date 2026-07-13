#!/bin/bash
cd "$(dirname "$0")"

# Lock dosyalarını temizle
rm -f .git/HEAD.lock .git/index.lock 2>/dev/null

git add src/app/layout.tsx

git commit -m "feat: Yandex Webmaster doğrulama meta tag + Google verification temizliği [deploy]

- layout.tsx: NEXT_PUBLIC_YANDEX_SITE_VERIFICATION desteği eklendi
- verification bloğu tek bir yerden yönetiliyor (duplicate kaldırıldı)
- Bing: GSC import ile doğrulandı (meta tag gereksiz)
- Yandex: meta tag Vercel env var üzerinden ekleniyor"

git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Push tamamlandı — Vercel deploy başlayacak (~2 dk)"
echo ""
echo "Deploy bittikten sonra Yandex'te 'Подтвердить' butonuna tıkla:"
echo "https://webmaster.yandex.com/site/https:www.nahaber.com:443/settings/access/"
