#!/bin/bash
cd "$(dirname "$0")"
echo "🔓 Lock temizle..."
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null || true
echo "📤 Push ediliyor..."
git push origin claude/nahabber-project-architecture-NZhLO
echo ""
echo "✅ Tamamlandı! Vercel ~2 dk içinde deploy eder."
echo "   Sonra cron-job.org → nahaber-seo → Re-enable"
echo ""
read -p "Kapatmak için Enter..."
