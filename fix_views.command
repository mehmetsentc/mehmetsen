#!/bin/bash
cd "$(dirname "$0")"
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null

git add src/components/news/NewsArticleLayout.tsx \
        src/components/home/desktop/DesktopStoryBlocks.tsx \
        next.config.ts \
        src/components/widgets/BorsaWidget.tsx

git commit -m "fix: görüntülenme sayısını kaldır + rozet + borsa CSP [deploy]

- NewsArticleLayout: görüntülenme sayısı gizlendi
- DesktopStoryBlocks: metin bazlı rozet tespiti kaldırıldı (false positive)
- next.config.ts: TradingView CSP eklendi
- BorsaWidget: script.text düzeltmesi"

git push
echo "✅ Push tamamlandı."
