#!/bin/bash

# EULA Fix — Git push + Vercel deploy tetikle
# Çift tıklayarak çalıştır

PROJECT_DIR="/Users/user/nahaber"
BRANCH="claude/nahabber-project-architecture-NZhLO"

echo "============================================================"
echo "NaHaber — EULA Fix Push"
echo "Tarih: $(date)"
echo "============================================================"
echo ""

cd "$PROJECT_DIR"

# Git lock temizle
rm -f .git/HEAD.lock .git/index.lock 2>/dev/null || true

# Mevcut durumu göster
echo "=== Commit durumu ==="
git log --oneline -3
echo ""

# Push et
echo "=== GitHub'a push ediliyor ==="
git push origin "$BRANCH"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Push başarılı!"
  echo ""
  echo "Vercel otomatik deploy edecek."
  echo "İzlemek için: https://vercel.com/dashboard"
  echo ""
  echo "Veya Vercel CLI ile deploy et:"
  echo "  cd $PROJECT_DIR && npx vercel --prod"
else
  echo ""
  echo "❌ Push başarısız. Tekrar dene veya Vercel CLI kullan:"
  echo "  cd $PROJECT_DIR && npx vercel --prod"
fi

echo ""
echo "PENCEREYI KAPATMAK İÇİN ENTER'A BAS..."
read
