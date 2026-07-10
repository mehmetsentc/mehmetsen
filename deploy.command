#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  NaHaber — Deploy Script
#  Bu script commit'leri birleştirip Vercel'e deploy eder.
#  Vercel Ignored Build Step: sadece "[deploy]" içeren commit'lerde build başlar.
#  Diğer tüm commit'ler (Cursor auto-commit vs.) build tetiklemez.
# ─────────────────────────────────────────────────────────────
cd "$(dirname "$0")"

BRANCH="claude/nahabber-project-architecture-NZhLO"

echo ""
echo "🚀 NaHaber Deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Branch kontrol
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "$BRANCH" ]; then
  echo "⚠️  Şu an '$CURRENT' branch'indesiniz."
  echo "   Deploy branch'i: $BRANCH"
  read -p "   Devam etmek ister misiniz? (e/h): " confirm
  [[ "$confirm" != "e" && "$confirm" != "E" ]] && echo "İptal." && exit 0
fi

# Kaç commit birleştirilsin?
echo ""
echo "Son commitler:"
git log --oneline -10
echo ""
read -p "Kaç commit birleştirilsin? (varsayılan: 1, birleştirmemek için 1 girin): " COUNT
COUNT=${COUNT:-1}

# Açıklama
read -p "Deploy mesajı: " MSG
MSG=${MSG:-"deploy: $(date '+%d %b %Y %H:%M')"}

# Uncommitted değişiklikler varsa önce commit et
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo ""
  echo "📦 Kaydedilmemiş değişiklikler var, önce commit ediliyor..."
  git add -A
  git commit -m "chore: deploy öncesi değişiklikler kaydedildi"
fi

# Commit'leri birleştir (squash)
if [ "$COUNT" -gt 1 ]; then
  echo ""
  echo "🔀 Son $COUNT commit birleştiriliyor..."
  git reset --soft HEAD~$COUNT
  git commit -m "$MSG [deploy]"
  echo "✅ $COUNT commit → 1 commit"
else
  # Sadece son commit mesajını değiştir
  git commit --amend -m "$MSG [deploy]" --no-edit 2>/dev/null || \
  git commit -m "$MSG [deploy]" --allow-empty
fi

# Push
echo ""
echo "📤 Push ediliyor → $BRANCH"
git push origin "$BRANCH" --force-with-lease

echo ""
echo "✅ Deploy başlatıldı!"
echo "   Vercel build: https://vercel.com/shenteam1/nahaber/deployments"
echo "   Canlı site:   https://www.nahaber.com"
echo ""
echo "   (Vercel ~2-3 dk içinde deploy eder)"
echo ""
read -p "Kapatmak için Enter'a bas..."
