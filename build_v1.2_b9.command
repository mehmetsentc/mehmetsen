#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NaHaber v1.2 Build 9 — App Store Rejection Fix Build"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Düzeltilen sorunlar (Guideline 2.1a):"
echo "  • Apple Sign In: Firebase iOS app (com.nahaber.app) kayıtlı"
echo "  • Konum izni: CLLocationManager native dialog + localStorage key-v2"
echo "  • Video shaking: YouTube iframe e.source filtresi + play butonu"
echo ""

# ── API key ────────────────────────────────────────────────────────────────────
echo "🔑 API key konumlandırılıyor..."
mkdir -p ~/.appstoreconnect/private_keys
cp -f "AuthKey_88PX7Q6W29.p8" ~/.appstoreconnect/private_keys/AuthKey_88PX7Q6W29.p8
echo "   ✅ API key hazır"
echo ""

# ── Next.js build ──────────────────────────────────────────────────────────────
echo "📦 Next.js build..."
npm run build 2>&1 | tail -8

echo ""
echo "📱 Capacitor sync (iOS)..."
npx cap sync ios 2>&1 | tail -5

echo ""
echo "🗑️  Eski archive temizleniyor..."
rm -rf NaHaber.xcarchive ipa/

echo ""
echo "🏗️  Xcode archive (Build 9)..."
# NOT: Proje CocoaPods kullanmıyor (SPM) → App.xcworkspace YOK.
# Doğru yol: App.xcodeproj (SPM bağımlılıkları otomatik çözülür)
xcodebuild archive \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "NaHaber.xcarchive" \
  MARKETING_VERSION=1.2 \
  CURRENT_PROJECT_VERSION=9 \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  PROVISIONING_PROFILE_SPECIFIER="NaHaber AppStore 2026" \
  DEVELOPMENT_TEAM=VMZA353GB7 \
  2>&1 | grep -E "(error:|ARCHIVE SUCCEEDED|BUILD SUCCEEDED|FAILED)" | tail -20

echo ""
echo "📦 IPA export ediliyor..."
xcodebuild -exportArchive \
  -archivePath "NaHaber.xcarchive" \
  -exportPath "ipa/" \
  -exportOptionsPlist "ExportOptions.plist" \
  -allowProvisioningUpdates \
  2>&1 | tail -10

echo ""
echo "🚀 App Store Connect'e yükleniyor..."
xcrun altool --upload-app \
  -f "ipa/App.ipa" \
  -t ios \
  --apiKey 88PX7Q6W29 \
  --apiIssuer 3a3d3b1e-e455-4c82-849b-f4db5a40d475 \
  2>&1 | tail -15

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Build 9 yüklendi!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Sonraki adımlar:"
echo "  1. appstoreconnect.apple.com → NaHaber → v1.2"
echo "  2. Build 9'u seç"
echo "  3. Submit for Review / Resubmit to App Review"
echo ""
read -p "Kapatmak için Enter'a bas..."
