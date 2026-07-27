#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  NaHaber — AI API sağlık (DeepSeek + Gemini + canlı site)
#  Çift tıkla veya: ./ai_api_health.command
# ─────────────────────────────────────────────────────────────
cd "$(dirname "$0")"
set -euo pipefail

if [ -f .env.local ]; then
  # shellcheck disable=SC2046
  export $(grep -E "^(DEEPSEEK_API_KEY|GEMINI_API_KEY|GEMINI_MODEL|DEEPSEEK_NEWS_MODEL|CRON_SECRET|NEXT_PUBLIC_SITE_URL)" .env.local | sed 's/\r$//' | xargs) || true
fi

SITE="${NEXT_PUBLIC_SITE_URL:-https://www.nahaber.com}"
SITE="${SITE%/}"
DS_MODEL="${DEEPSEEK_NEWS_MODEL:-deepseek-v4-flash}"
GM_MODEL="${GEMINI_MODEL:-gemini-2.5-flash}"

echo ""
echo "════════════════════════════════════════"
echo " NaHaber AI API — Sağlık Kontrolü"
echo "════════════════════════════════════════"
echo " Site : $SITE"
echo " Saat : $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

ok=0
fail=0

check_http() {
  local name="$1"
  local code="$2"
  if [ "$code" = "200" ]; then
    echo "   ✅ $name (HTTP $code)"
    ok=$((ok + 1))
  else
    echo "   ❌ $name (HTTP $code)"
    fail=$((fail + 1))
  fi
}

# 1) Canlı /api/health
echo "1) Canlı site /api/health"
HEALTH=$(curl -sS -w "\n%{http_code}" --max-time 15 "$SITE/api/health" || echo -e "\n000")
HEALTH_BODY=$(echo "$HEALTH" | sed '$d')
HEALTH_CODE=$(echo "$HEALTH" | tail -n1)
check_http "health" "$HEALTH_CODE"
echo "   $HEALTH_BODY" | head -c 220
echo ""
echo ""

# 2) DeepSeek
echo "2) DeepSeek chat/completions ($DS_MODEL)"
if [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  echo "   ❌ DEEPSEEK_API_KEY yok (.env.local)"
  fail=$((fail + 1))
else
  DS_RESP=$(curl -sS -w "\n%{http_code}" --max-time 25 \
    -X POST "https://api.deepseek.com/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
    -d "{\"model\":\"$DS_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"JSON olarak {\\\"ok\\\":true} döndür\"}],\"max_tokens\":40,\"response_format\":{\"type\":\"json_object\"}}" \
    || echo -e "\n000")
  DS_CODE=$(echo "$DS_RESP" | tail -n1)
  check_http "DeepSeek" "$DS_CODE"
  if [ "$DS_CODE" != "200" ]; then
    echo "   $(echo "$DS_RESP" | sed '$d' | head -c 280)"
    echo ""
  fi
fi
echo ""

# 3) Gemini (opsiyonel — maliyet bayrakları kapalı olabilir)
echo "3) Gemini generateContent ($GM_MODEL) — opsiyonel"
if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "   ⚠️  GEMINI_API_KEY yok — atlandı"
else
  GM_RESP=$(curl -sS -w "\n%{http_code}" --max-time 25 \
    -X POST "https://generativelanguage.googleapis.com/v1beta/models/${GM_MODEL}:generateContent?key=${GEMINI_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"contents":[{"role":"user","parts":[{"text":"Tek kelime: OK"}]}],"generationConfig":{"maxOutputTokens":16}}' \
    || echo -e "\n000")
  GM_CODE=$(echo "$GM_RESP" | tail -n1)
  check_http "Gemini" "$GM_CODE"
  if [ "$GM_CODE" != "200" ]; then
    echo "   $(echo "$GM_RESP" | sed '$d' | head -c 280)"
    echo ""
  fi
fi
echo ""

# 4) /api/ai/status (CRON_SECRET)
echo "4) Canlı /api/ai/status (CRON_SECRET)"
if [ -z "${CRON_SECRET:-}" ]; then
  echo "   ⚠️  CRON_SECRET yok — atlandı"
else
  ST_RESP=$(curl -sS -w "\n%{http_code}" --max-time 40 \
    -H "Authorization: Bearer $CRON_SECRET" \
    "$SITE/api/ai/status" || echo -e "\n000")
  ST_CODE=$(echo "$ST_RESP" | tail -n1)
  check_http "ai/status" "$ST_CODE"
  echo "   $(echo "$ST_RESP" | sed '$d' | head -c 360)"
  echo ""
fi
echo ""

echo "════════════════════════════════════════"
echo " Sonuç: $ok başarılı · $fail hatalı"
echo "════════════════════════════════════════"
echo ""
read -r -p "Kapatmak için Enter..."
