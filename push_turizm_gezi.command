#!/bin/bash
cd "$(dirname "$0")"

echo "📤 Turizm & Gezi type fix commit + push..."
git commit -m "fix: EditorId tipine turizm-news ve gezi-news eklendi"
git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Push tamamlandı! Vercel otomatik deploy edecek."
echo ""
read -p "Kapatmak için Enter'a bas..."
