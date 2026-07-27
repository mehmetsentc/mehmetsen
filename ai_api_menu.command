#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  NaHaber — AI API genel komutlar (menü)
#  1) Sağlık  2) Canlı status  3) Editör seed/debug  4) Deploy push
# ─────────────────────────────────────────────────────────────
cd "$(dirname "$0")"

BRANCH="claude/nahabber-project-architecture-NZhLO"
SITE="${NEXT_PUBLIC_SITE_URL:-https://www.nahaber.com}"

if [ -f .env.local ]; then
  # shellcheck disable=SC2046
  export $(grep -E "^(CRON_SECRET|NEXT_PUBLIC_SITE_URL|DEEPSEEK_API_KEY)" .env.local | sed 's/\r$//' | xargs) || true
fi
SITE="${NEXT_PUBLIC_SITE_URL:-https://www.nahaber.com}"
SITE="${SITE%/}"

echo ""
echo "════════════════════════════════════════"
echo " NaHaber — Genel AI API Komutları"
echo "════════════════════════════════════════"
echo " 1) AI API sağlık (DeepSeek / Gemini / health)"
echo " 2) Canlı /api/ai/status"
echo " 3) AI editör debug (Firestore — son haberler)"
echo " 4) AI editör alan backfill (persona fields)"
echo " 5) Deploy + push ([deploy] commit)"
echo " 0) Çıkış"
echo ""
read -r -p "Seçim: " CHOICE

case "$CHOICE" in
  1)
    exec bash ./ai_api_health.command
    ;;
  2)
    if [ -z "${CRON_SECRET:-}" ]; then
      echo "CRON_SECRET .env.local içinde yok."
      read -r -p "Enter..."
      exit 1
    fi
    echo ""
    curl -sS --max-time 45 \
      -H "Authorization: Bearer $CRON_SECRET" \
      "$SITE/api/ai/status" | python3 -m json.tool 2>/dev/null || \
      curl -sS --max-time 45 -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/ai/status"
    echo ""
    read -r -p "Enter..."
    ;;
  3)
    npx tsx scripts/debug-ai-editor-news.ts
    echo ""
    read -r -p "Enter..."
    ;;
  4)
    npx tsx scripts/backfill-ai-editor-news-fields.ts
    echo ""
    read -r -p "Enter..."
    ;;
  5)
    exec bash ./push_ai_fix.command
    ;;
  0|*)
    echo "Çıkış."
    ;;
esac
