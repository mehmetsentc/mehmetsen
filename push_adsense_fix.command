#!/bin/bash
cd "$(dirname "$0")"
echo "=== AdSense + Kategori + OG Fix Deploy (tam) ==="
rm -f .git/HEAD.lock .git/index.lock

git add src/services/newsroom/editors/stage1_contentWriter.ts \
        src/services/newsroom/editors/stage3_categoryEditor.ts \
        src/app/api/og/social/\[id\]/route.tsx \
        src/components/news/NewsArticleStatic.tsx

git commit -m "fix: stage3 text→title typo + AdSense içerik kalitesi + OG route + kaynak linki [deploy]

stage3_categoryEditor.ts:
- BİRİNCİL KONU KURALI eklendi (Erdoğan-Sánchez→siyaset, teknoloji yan atıf→ekonomi)
- Heuristik fallback: text değişkeni → title (TypeScript derleme hatası düzeltildi)

stage1_contentWriter.ts:
- content min 200 → min 500 kelime (AdSense thin content)
- Kod minimum kontrolü 100 → 400 kelime
- sourceUrl prompt'a dahil edildi

og/social/[id]/route.tsx:
- isValidImageUrl(): klasör URL ve truncated URL reddet
- fetchArticle hatasında fallbackImageResponse()

NewsArticleStatic.tsx:
- sourceUrl varsa tıklanabilir kaynak linki (rel=nofollow)"

git push origin claude/nahabber-project-architecture-NZhLO
echo ""
echo "=== Done — Vercel build başlıyor ==="
echo "Build tamamlandıktan sonra AdSense onboarding'e gidin:"
echo "https://adsense.google.com/adsense/u/0/pub-2018428956792076/onboarding"
