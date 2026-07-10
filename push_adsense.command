#!/bin/bash
cd "$(dirname "$0")"

echo "📤 AdSense değişiklikleri GitHub'a gönderiliyor..."
git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Push tamamlandı! Vercel otomatik deploy edecek."
echo ""
read -p "Kapatmak için Enter'a bas..."
