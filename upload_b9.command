#!/bin/bash
cd "$(dirname "$0")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NaHaber Build 9 — IPA Upload (Archive zaten hazır)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── IPA kontrol ──────────────────────────────────────────────────────────────
if [ ! -f "ipa/App.ipa" ]; then
  echo "❌ ipa/App.ipa bulunamadı! Önce build_v1.2_b9.command çalıştır."
  exit 1
fi
echo "✅ IPA hazır: $(du -sh ipa/App.ipa | cut -f1)"
echo ""

# ── API key ──────────────────────────────────────────────────────────────────
echo "🔑 API key konumlandırılıyor..."
mkdir -p ~/.appstoreconnect/private_keys
cp -f "AuthKey_88PX7Q6W29.p8" ~/.appstoreconnect/private_keys/AuthKey_88PX7Q6W29.p8
echo "   ✅ API key hazır"
echo ""

# ── Upload ───────────────────────────────────────────────────────────────────
echo "🚀 App Store Connect'e yükleniyor..."
echo "   Key ID: 88PX7Q6W29"
echo "   Issuer: 0b4b2878-8080-476e-aafe-0bd515dce30c"
echo ""

xcrun altool --upload-app \
  -f "ipa/App.ipa" \
  -t ios \
  --apiKey 88PX7Q6W29 \
  --apiIssuer 0b4b2878-8080-476e-aafe-0bd515dce30c \
  2>&1

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Eğer yükleme başarılıysa:"
echo "  1. appstoreconnect.apple.com → NaHaber → v1.2"
echo "  2. Build 9'u seç (TestFlight'ta görünmesi ~15 dk)"
echo "  3. Resubmit to App Review"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -p "Kapatmak için Enter'a bas..."
