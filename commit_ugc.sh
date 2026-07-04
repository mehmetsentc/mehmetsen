#!/bin/bash
set -e
cd "$(dirname "$0")"

# Lock dosyalarını temizle
rm -f .git/HEAD.lock .git/index.lock

git add \
  src/components/video/VideoCommentSheet.tsx \
  src/components/auth/EulaModal.tsx \
  src/components/auth/AuthProvider.tsx \
  src/app/api/user/accept-terms/route.ts \
  src/services/userService.ts \
  src/types/user.ts

git commit -m "feat: UGC moderation — flag/block menus, EULA modal (Guideline 1.2)

- VideoCommentSheet: per-comment menu with Şikayet et and Kullanıcıyı engelle
- ReportModal: reason selector → POST /api/reports
- Block: POST /api/blocks + instant hide of blocked user comments
- EulaModal: shown on first login when termsAcceptedAt is null
- POST /api/user/accept-terms: writes termsAcceptedAt to Firestore
- User type + userService.normalizeUser: termsAcceptedAt field added
- AuthProvider: injects EulaModal when user.termsAcceptedAt is falsy"

git push
echo "✅ Commit + push başarılı!"
