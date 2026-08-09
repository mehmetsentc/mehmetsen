#!/bin/bash
cd "$(dirname "$0")"

echo "🔓 Git lock dosyaları temizleniyor..."
rm -f .git/HEAD.lock .git/index.lock

echo "📦 Değişiklikler commit ediliyor..."
git add src/services/adminNewsService.ts
git commit -m "fix(admin): sort news list by createdAt desc instead of updatedAt

Fetching by updatedAt caused recently-edited old articles to appear
in the top-50 window while newly created articles fell outside.
Client-side sort was already by createdAt — now server fetch matches."

echo "🚀 Push ediliyor..."
git push origin claude/nahabber-project-architecture-NZhLO

echo "✅ Tamamlandı!"
