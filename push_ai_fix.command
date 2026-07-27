#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  NaHaber — AI / editör / öne çıkan düzeltmelerini [deploy] push
# ─────────────────────────────────────────────────────────────
cd "$(dirname "$0")"
set -euo pipefail

BRANCH="claude/nahabber-project-architecture-NZhLO"
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "$BRANCH" ]; then
  echo "⚠️  Branch: $CURRENT (beklenen: $BRANCH)"
  read -r -p "Yine de devam? (e/h): " c
  [[ "$c" != "e" && "$c" != "E" ]] && exit 0
fi

echo "📦 Staging AI / CMS / featured değişiklikleri..."
git add \
  src/app/api/admin/ai-assist/route.ts \
  src/app/api/admin/news-drafts/\[id\]/approve/route.ts \
  src/app/api/admin/news-drafts/bulk-approve/route.ts \
  src/app/api/admin/news/\[id\]/route.ts \
  src/app/api/admin/news/route.ts \
  src/components/admin/AdminNewsEditor.tsx \
  src/lib/newsMapper.ts \
  src/services/newsDraftService.ts \
  src/services/newsService.server.ts \
  src/services/newsroom/pipeline.ts \
  src/types/news.ts \
  scripts/backfill-ai-editor-news-fields.ts \
  scripts/debug-ai-editor-news.ts \
  ai_api_health.command \
  ai_api_menu.command \
  push_ai_fix.command \
  test_ai_apis.command \
  2>/dev/null || true

# refresh script opsiyonel
[ -f scripts/refresh-ai-editor-styles.ts ] && git add scripts/refresh-ai-editor-styles.ts || true

if git diff --cached --quiet; then
  echo "Commitlenecek staged değişiklik yok — empty deploy commit."
  git commit --allow-empty -m "$(cat <<'EOF'
chore(ai): trigger deploy after AI editor + featured fixes [deploy]

EOF
)"
else
  git commit -m "$(cat <<'EOF'
fix(ai): editör tarzı tek tuş + öne çıkan yayın + persona alanları [deploy]

CMS'te seçilen AI editörün prompt/tarzıyla haber hazırlama; draft→publish
persona alanları; Öne Çıkan açılınca otomatik yayına alma ve featured sorgu birleştirme.
EOF
)"
fi

echo "📤 Push → origin/$BRANCH"
git push -u origin HEAD

echo ""
echo "✅ Push tamam. Vercel [deploy] build'i başlar (~2–3 dk)."
echo "   https://www.nahaber.com/api/health"
echo ""
read -r -p "Enter..."
