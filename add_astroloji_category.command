#!/bin/bash
cd "$(dirname "$0")"
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null

git add \
  "src/constants/config.ts" \
  "src/constants/categorySections.ts"

git commit -m "feat: Yaşam altına Astroloji alt kategorisi ekle [deploy]

- DEFAULT_CATEGORIES: astroloji (parentId: yasam, sparkles ikonu)
- SIDEBAR_MAIN_CATEGORY_IDS + TOP_NAV_CATEGORY_IDS: yasam eklendi
- getSiteNavItems: yasam + astroloji (indent) nav'a eklendi
- ADMIN_CATEGORY_GROUP_DEFS: astroloji Yaşam&Turizm grubuna eklendi
- categorySections: yasam sırası [astroloji, yasam]
- resolveSwipeCategoryKey: astroloji → yasam swipe mapping"

git push
echo "Push tamamlandi."
