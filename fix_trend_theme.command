#!/bin/bash
cd "$(dirname "$0")"
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null

git add src/components/home/desktop/DesktopMustWatch.tsx

git commit -m "fix: Trend Haberler tema-duyarlı arka plan [deploy]

Light: #0f1428 (koyu lacivert = --bg-inverse)
Dark:  #121a38 (biraz daha açık lacivert = --bg-muted)
Her iki temada da beyaz yazı okunabilir kalır."

git push
echo "✅ Push tamamlandı."
