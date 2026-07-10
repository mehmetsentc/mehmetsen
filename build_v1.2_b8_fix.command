#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NaHaber v1.2 Build 8 — Fix Build (5. Deneme)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── API Key dosyasını doğru konuma kopyala ────────────────────────────────────
echo "🔑 API key konumlandırılıyor..."
mkdir -p ~/.appstoreconnect/private_keys
cp -f "AuthKey_88PX7Q6W29.p8" ~/.appstoreconnect/private_keys/AuthKey_88PX7Q6W29.p8
echo "   ✅ $(ls -la ~/.appstoreconnect/private_keys/AuthKey_88PX7Q6W29.p8)"
echo ""

# ── iOS build ─────────────────────────────────────────────────────────────────
echo "📦 Next.js export..."
npm run build 2>&1 | tail -5

echo ""
echo "📱 Capacitor sync..."
npx cap sync ios 2>&1 | tail -5

echo ""
echo "🏗️  Xcode archive (Build 8) — Manual Distribution signing..."
# Düzeltme: CODE_SIGN_STYLE=Manual + Apple Distribution (Automatic Dev profili arıyordu)
xcodebuild archive \
  -workspace ios/App/App.xcodeproj/project.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "NaHaber.xcarchive" \
  MARKETING_VERSION=1.2 \
  CURRENT_PROJECT_VERSION=8 \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  PROVISIONING_PROFILE_SPECIFIER="NaHaber AppStore 2026" \
  DEVELOPMENT_TEAM=VMZA353GB7 \
  2>&1 | grep -E "(error:|warning: .*(Error|error)|Archive|SUCCEEDED|FAILED|Signing)" | tail -20

echo ""
echo "📤 IPA export ediliyor..."
xcodebuild -exportArchive \
  -archivePath "NaHaber.xcarchive" \
  -exportPath "ipa/" \
  -exportOptionsPlist "ExportOptions.plist" \
  -allowProvisioningUpdates \
  2>&1 | tail -10

echo ""
echo "🚀 App Store Connect'e gönderiliyor..."
xcrun altool --upload-app \
  -f "ipa/App.ipa" \
  -t ios \
  --apiKey 88PX7Q6W29 \
  --apiIssuer 0b4b2878-8080-476e-aafe-0bd515dce30c \
  2>&1 | tail -15

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Build 8 tamamlandı!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -p "Kapatmak için Enter'a bas..."
