#!/bin/bash
cd "$(dirname "$0")"
echo "=== Anında sosyal paylaşım deploy ==="
rm -f .git/HEAD.lock .git/index.lock

git add src/lib/social/publishOneSocial.ts \
        src/app/api/admin/news/\[id\]/route.ts \
        src/app/api/admin/social/diagnose/route.ts

git commit -m "feat: anında sosyal paylaşım — haber yayınlandığında after() ile FB+IG tetikle [deploy]

- publishOneSocial.ts: tek haber pipeline (fire-and-forget)
- admin/news PUT: Çanakkale haberi ilk kez yayınlandığında after() ile çağır
- draft onayında da tetikle
- diagnose: Firestore token kaynağını da göster (cron'un gerçekte kullandığı token)"

git push origin claude/nahabber-project-architecture-NZhLO
echo ""
echo "=== Done — Vercel build başlıyor ==="
