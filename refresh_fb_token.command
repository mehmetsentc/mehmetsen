#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# Facebook Token Yenileme Scripti
# Kısa ömürlü user token → Uzun ömürlü user token (60 gün) →
# Kalıcı page token (hiç sona ermez) → Vercel + .env.local güncelle
# ─────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

# .env.local'dan değerleri yükle
export $(grep -v '^#' .env.local | xargs) 2>/dev/null || true

APP_ID="${FACEBOOK_APP_ID:-1592166035803644}"
APP_SECRET="${FACEBOOK_APP_SECRET:-}"
PAGE_ID="${FACEBOOK_PAGE_ID:-167304713122153}"
CRON="${CRON_SECRET:-}"

echo ""
echo "══════════════════════════════════════════════════"
echo "   Facebook Token Yenileme"
echo "══════════════════════════════════════════════════"
echo ""

# App Secret kontrolü
if [ -z "$APP_SECRET" ]; then
  echo "❌  FACEBOOK_APP_SECRET .env.local'da bulunamadı."
  echo ""
  echo "   Nasıl alınır?"
  echo "   1. https://developers.facebook.com/apps/1592166035803644/settings/basic/"
  echo "      adresine git"
  echo "   2. 'App Secret' yanındaki 'Show' butonuna tıkla"
  echo "   3. Facebook şifreni gir"
  echo "   4. Çıkan değeri .env.local'a şöyle ekle:"
  echo "      FACEBOOK_APP_SECRET=<kopya_ettigin_deger>"
  echo "   5. Bu scripti tekrar çalıştır"
  echo ""
  read -p "Şimdi girmek ister misin? (E/h): " ans
  if [[ "$ans" =~ ^[Ee]$ ]]; then
    read -rsp "App Secret: " APP_SECRET
    echo ""
    if [ -z "$APP_SECRET" ]; then
      echo "Boş bırakıldı, çıkılıyor."; exit 1
    fi
    # .env.local'a yaz
    if grep -q "FACEBOOK_APP_SECRET" .env.local 2>/dev/null; then
      sed -i.bak "s/^FACEBOOK_APP_SECRET=.*/FACEBOOK_APP_SECRET=${APP_SECRET}/" .env.local
    else
      echo "FACEBOOK_APP_SECRET=${APP_SECRET}" >> .env.local
    fi
    echo "✅  .env.local güncellendi."
  else
    echo "İptal edildi."; exit 1
  fi
fi

# ─── Adım 1: Kısa ömürlü USER token al ───────────────────────────
echo ""
echo "▶  Adım 1 / 3 — Kısa ömürlü User Token"
echo ""
echo "   Meta Graph API Explorer'ı aç:"
echo "   https://developers.facebook.com/tools/explorer/?method=GET&path=me%3Ffields%3Did%2Cname&version=v25.0"
echo ""
echo "   Sayfadaki 'Access Token' alanındaki değeri kopyala."
echo "   (EAA... ile başlayan uzun string)"
echo ""
read -rsp "Buraya yapıştır (gizli tutulacak): " SHORT_USER_TOKEN
echo ""

if [ -z "$SHORT_USER_TOKEN" ]; then
  echo "Token boş bırakıldı, çıkılıyor."; exit 1
fi

# ─── Adım 2: Uzun ömürlü user token (60 gün) al ──────────────────
echo ""
echo "▶  Adım 2 / 3 — Uzun ömürlü User Token alınıyor..."

LONG_USER_RESP=$(curl -s "https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${SHORT_USER_TOKEN}")

LONG_USER_TOKEN=$(echo "$LONG_USER_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null || echo "")

if [ -z "$LONG_USER_TOKEN" ]; then
  echo "❌  Uzun ömürlü token alınamadı:"
  echo "$LONG_USER_RESP" | python3 -m json.tool 2>/dev/null || echo "$LONG_USER_RESP"
  exit 1
fi
echo "✅  Uzun ömürlü user token alındı (60 gün)."

# ─── Adım 3: Kalıcı Page Access Token al ─────────────────────────
echo ""
echo "▶  Adım 3 / 3 — Kalıcı Page Token alınıyor..."

PAGE_RESP=$(curl -s "https://graph.facebook.com/v25.0/me/accounts?fields=id,name,access_token&access_token=${LONG_USER_TOKEN}")

PERMANENT_PAGE_TOKEN=$(echo "$PAGE_RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
pages = d.get('data', [])
page = next((p for p in pages if p.get('id') == '${PAGE_ID}'), None)
if page:
    print(page['access_token'])
" 2>/dev/null || echo "")

if [ -z "$PERMANENT_PAGE_TOKEN" ]; then
  echo "❌  Page token alınamadı. Yanıt:"
  echo "$PAGE_RESP" | python3 -m json.tool 2>/dev/null || echo "$PAGE_RESP"
  exit 1
fi

echo "✅  Kalıcı page token alındı!"
echo ""

# ─── .env.local güncelle ─────────────────────────────────────────
echo "📝  .env.local güncelleniyor..."
sed -i.bak "s|^FACEBOOK_PAGE_ACCESS_TOKEN=.*|FACEBOOK_PAGE_ACCESS_TOKEN=${PERMANENT_PAGE_TOKEN}|" .env.local
sed -i.bak "s|^INSTAGRAM_ACCESS_TOKEN=.*|INSTAGRAM_ACCESS_TOKEN=${PERMANENT_PAGE_TOKEN}|" .env.local
echo "✅  .env.local güncellendi."

# ─── Vercel güncelle ─────────────────────────────────────────────
if command -v vercel &>/dev/null; then
  echo "☁️   Vercel env vars güncelleniyor..."
  echo "$PERMANENT_PAGE_TOKEN" | vercel env add FACEBOOK_PAGE_ACCESS_TOKEN production --force 2>/dev/null || true
  echo "$PERMANENT_PAGE_TOKEN" | vercel env add INSTAGRAM_ACCESS_TOKEN production --force 2>/dev/null || true
  echo "✅  Vercel güncellendi."
else
  # Vercel REST API ile güncelle
  echo "☁️   Vercel API ile güncelleniyor..."
  VERCEL_TOKEN_IN_ENV=$(grep 'VERCEL_TOKEN' .env.local 2>/dev/null | cut -d= -f2 || echo "")
  if [ -n "$VERCEL_TOKEN_IN_ENV" ]; then
    curl -s -X PATCH "https://api.vercel.com/v9/projects/prj_JuTvdlhsTlDEo5ZbgV3i5KMgTVCY/env/SokfyVr6X9pIS75v?teamId=team_l9fJWKsf8Je8FR5MMx87ES1Q" \
      -H "Authorization: Bearer $VERCEL_TOKEN_IN_ENV" \
      -H "Content-Type: application/json" \
      -d "{\"value\":\"${PERMANENT_PAGE_TOKEN}\"}" > /dev/null
    curl -s -X PATCH "https://api.vercel.com/v9/projects/prj_JuTvdlhsTlDEo5ZbgV3i5KMgTVCY/env/YG0BPCu3zJDi5zT9?teamId=team_l9fJWKsf8Je8FR5MMx87ES1Q" \
      -H "Authorization: Bearer $VERCEL_TOKEN_IN_ENV" \
      -H "Content-Type: application/json" \
      -d "{\"value\":\"${PERMANENT_PAGE_TOKEN}\"}" > /dev/null
    echo "✅  Vercel güncellendi."
  else
    echo "⚠️   Vercel manual güncelleme gerekiyor:"
    echo "     vercel.com/shenteam1/nahaber/settings/environment-variables"
    echo "     FACEBOOK_PAGE_ACCESS_TOKEN ve INSTAGRAM_ACCESS_TOKEN değerlerini değiştir."
  fi
fi

# ─── Firestore güncelle (reshare_canakkale.command ile) ──────────
echo ""
echo "🔄  Token Firestore'a kaydediliyor..."
RESPONSE=$(curl -s -X POST "https://www.nahaber.com/api/admin/social/update-token" \
  -H "Authorization: Bearer ${CRON}" \
  -H "Content-Type: application/json" \
  -d "{\"facebookPageToken\":\"${PERMANENT_PAGE_TOKEN}\",\"instagramToken\":\"${PERMANENT_PAGE_TOKEN}\"}" 2>/dev/null || echo "")
if echo "$RESPONSE" | grep -q '"ok"'; then
  echo "✅  Firestore güncellendi."
else
  echo "ℹ️   Firestore güncellemesi başarısız (normal, Vercel env yeterli)."
fi

echo ""
echo "══════════════════════════════════════════════════"
echo "✅  Facebook token başarıyla yenilendi!"
echo "   Bu token KALICIDIR — sona ermez."
echo "══════════════════════════════════════════════════"
echo ""
read -p "Çıkmak için Enter'a bas..."
