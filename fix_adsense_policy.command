#!/bin/bash
cd "$(dirname "$0")"
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null

git add \
  "src/app/layout.tsx" \
  "src/app/(main)/gizlilik/page.tsx" \
  "src/app/(main)/hukuk/cerez-politikasi/page.tsx" \
  "src/components/layout/DeferredThirdParty.tsx"

git commit -m "feat: AdSense Consent Mode v2 + Gizlilik Politikasi guncelleme [deploy]

1. layout.tsx - head icine Google Consent Mode v2 default ayari eklendi.
2. DeferredThirdParty.tsx - AdSense script artik her zaman yuklenir.
3. gizlilik/page.tsx - Google AdSense / DART cerez aciklamasi eklendi.
4. cerez-politikasi/page.tsx - Google AdSense ucuncu taraf listesine eklendi."

git push
echo "Push tamamlandi."
