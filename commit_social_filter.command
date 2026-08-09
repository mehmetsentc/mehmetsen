#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "🔓 Git kilidi temizleniyor..."
rm -f .git/HEAD.lock .git/index.lock 2>/dev/null || true

echo "📦 Staging..."
git add src/lib/social/publishOneSocial.ts
git add src/app/api/cron/social/route.ts

echo "✅ Commit yapılıyor..."
git commit -m "fix(social): canlı yayın ve boş içerikli haberleri filtrele [deploy]

isSkippableForSocial() eklendi: #Canlı başlık, whatsapp/bluesky link, boş içerik → atla
isOwnContent() + isSkippableForSocial() cron/social/route.ts'e entegre edildi"

echo "🚀 Push ediliyor..."
git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✓ Tamamlandı! Vercel'de deploy başlamalı."
