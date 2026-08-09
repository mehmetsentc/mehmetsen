#!/bin/bash
set -e
cd "$(dirname "$0")"
rm -f .git/index.lock

git add \
  src/lib/gmail/types.ts \
  src/lib/gmail/crypto.ts \
  src/lib/gmail/oauth.ts \
  src/lib/gmail/client.ts \
  src/services/gmailService.ts \
  src/lib/firebase/collections.ts \
  src/app/api/admin/gmail/status/route.ts \
  src/app/api/admin/gmail/connect/route.ts \
  src/app/api/admin/gmail/callback/route.ts \
  src/app/api/admin/gmail/disconnect/route.ts \
  src/app/api/admin/gmail/messages/route.ts \
  "src/app/api/admin/gmail/messages/[id]/route.ts" \
  "src/app/api/admin/gmail/messages/[id]/to-draft/route.ts" \
  src/app/admin/inbox/page.tsx

git commit -m "feat: Gmail OAuth inbox entegrasyonu — bilgi@nahaber.com [deploy]

- src/lib/gmail/ — types, crypto (AES-256-GCM), oauth (google-auth-library), client (REST)
- src/services/gmailService.ts — token storage/retrieval, auto-refresh
- API routes: status, connect, callback, disconnect, messages, messages/[id], to-draft
- collections.ts — INTEGRATIONS collection eklendi
- admin/inbox/page.tsx — tam çalışan inbox UI

Security:
- Refresh token encrypted at rest (AES-256-GCM, GMAIL_TOKEN_ENCRYPTION_KEY)
- Callback verifies authorized account === GMAIL_MAILBOX (bilgi@nahaber.com)
- CSRF state encrypted; 10-min TTL
- to-draft: NEVER auto-publishes; creates pending_review draft only
- Secrets: GMAIL_CLIENT_SECRET + GMAIL_TOKEN_ENCRYPTION_KEY in .env.local only"

git push origin HEAD
echo ""
echo "✓ Gmail integration pushed! Vercel deploy başlayacak (~2 dk)"
echo ""
echo "Vercel env vars: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI, GMAIL_MAILBOX, GMAIL_TOKEN_ENCRYPTION_KEY"
