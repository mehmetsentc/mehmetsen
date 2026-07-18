#!/bin/bash
cd "$(dirname "$0")"
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null

git add src/components/home/desktop/DesktopStoryBlocks.tsx next.config.ts src/components/widgets/BorsaWidget.tsx

git commit -m "fix: yanlış soruşturma rozetini kaldır + borsa CSP [deploy]

- Metin tabanlı badge tespiti kaldırıldı (false positive üretiyordu)
- Sadece breaking=true → Son Dakika, featured=true → Özel Haber gösterilir
- TradingView CSP düzeltmesi (s3.tradingview.com eklendi)
- BorsaWidget: script.text kullanımı"

git push
echo "✅ Push tamamlandı."
