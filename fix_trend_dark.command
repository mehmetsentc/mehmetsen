#!/bin/bash
cd "$(dirname "$0")"
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null

git add src/components/home/desktop/DesktopMustWatch.tsx

git commit -m "fix: Trend Haberler dark mode — bg-[color-text] → bg-neutral-900 [deploy]

Dark modda --color-text beyaza döndüğü için arka plan beyaz oluyordu,
yazı da beyaz olduğundan okunmuyordu. Sabit bg-neutral-900 ile düzeltildi."

git push
echo "✅ Push tamamlandı."
