#!/bin/bash
cd "$(dirname "$0")"
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null

git add src/components/home/desktop/DesktopOpinionStrip.tsx \
        src/components/news/NewsArticleLayout.tsx \
        src/components/home/desktop/DesktopStoryBlocks.tsx \
        next.config.ts \
        src/components/widgets/BorsaWidget.tsx

git commit -m "fix: editöryal bölüm + görüntülenme + rozet + borsa CSP [deploy]

- DesktopOpinionStrip: Görüş&Yorum → Editöryal Seçki, yazar avatar/köşe yazısı etiketi kaldırıldı
- NewsArticleLayout: görüntülenme sayısı gizlendi
- DesktopStoryBlocks: metin bazlı yanlış rozet tespiti kaldırıldı
- next.config.ts: TradingView CSP eklendi
- BorsaWidget: script.text düzeltmesi"

git push
echo "✅ Push tamamlandı."
