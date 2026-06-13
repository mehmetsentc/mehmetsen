#!/bin/bash
# Git index.lock temizleme + commit + push
set -e

cd "$(dirname "$0")"

echo "🔓 index.lock kaldırılıyor..."
rm -f .git/index.lock

echo "📋 Staged değişiklikler:"
git status --short

echo ""
echo "💾 Commit ediliyor..."
git add -A
git commit -m "optimize: RSS daraltma + gemini-1.5-flash-8b + cron fix + baseWorker hata toleransı

- baseWorker: Firestore RESOURCE_EXHAUSTED graceful handling (skip source, no 500)
- config.ts: RSS kaynakları 80+ → ~30 (national 14→7, breaking 10→6, world 12→5, tech 14→5, sports 15→5, health 9→4, politics 11→4, magazine 9→3, finans 7→3)
- sources.ts: reuters feedUrl bug fix (BBC URL'si vardı); 14 kaynak disabled
- vercel.json: local worker cron 30min → hourly
- .env.local: GEMINI_MODEL gemini-2.5-flash → gemini-1.5-flash-8b (%75 daha ucuz)"

echo ""
echo "🚀 Push ediliyor..."
git push

echo ""
echo "✅ Tamamlandı!"
