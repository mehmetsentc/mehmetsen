#!/bin/bash
cd "$(dirname "$0")"

rm -f .git/HEAD.lock 2>/dev/null

git commit --allow-empty -m "feat: müze rehberi + IP geo fallback + Süper Lig widget [deploy]"
git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Deploy tetiklendi!"
