#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "🗑️  fix-git.sh kaldırılıyor..."
git rm --cached fix-git.sh 2>/dev/null || true
rm -f fix-git.sh

echo "📋 Değişiklikler:"
git status --short

echo ""
echo "💾 Commit ediliyor..."
git add -A
git commit -m "fix: ai-pipeline 500 + aa breaking kaynaktan çıkarıldı + aiQueue index

- pipeline.ts: processPipelineQueue Firestore hatalarını graceful handle eder (200 döner)
- firestore.indexes.json: aiQueue + newsQueue composite index eklendi
- config.ts: aa.com.tr BREAKING kaynaklardan kaldırıldı (%68.8 hata oranı)
- fix-git.sh: geçici script silindi"

echo ""
echo "🚀 Push ediliyor..."
git push

echo ""
echo "✅ Tamamlandı!"
