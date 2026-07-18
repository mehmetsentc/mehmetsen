#!/bin/bash
cd "$(dirname "$0")"
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null

git add next.config.ts src/components/widgets/BorsaWidget.tsx

git commit -m "fix(borsa): TradingView CSP + script.text düzeltmesi [deploy]

- next.config.ts: s3.tradingview.com script-src/frame-src/connect-src'ye eklendi
- BorsaWidget: script.innerHTML → script.text (TradingView embed standart yöntemi)"

git push
echo ""
echo "✅ Borsa widget düzeltmesi push edildi."
