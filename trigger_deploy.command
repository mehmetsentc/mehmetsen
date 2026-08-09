#!/bin/bash
cd "$(dirname "$0")"
rm -f .git/index.lock
git commit --allow-empty -m "fix(ai): DeepSeek model adı + Gemini fallback [deploy]"
git push
echo ""
echo "Vercel deploy tetiklendi."
