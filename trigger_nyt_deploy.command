#!/bin/bash
cd "$(dirname "$0")"

# Lock temizle
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null

# Empty commit ile Vercel webhook'unu tetikle
git commit --allow-empty -m "chore: trigger NYT tema deploy [deploy]"
git push
echo ""
echo "✅ Deploy tetiklendi — vercel.com/shenteam1/nahaber/deployments sayfasını yenile."
