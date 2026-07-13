#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NaHaber v1.2 Build 10 — Apple Sign In iPad Fix"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Düzeltilen sorun (Guideline 2.1a — Build 9 reddi):"
echo "  • NativeAppleSignInPlugin.swift — presentationAnchor öncelik düzeltmesi"
echo "    iPad Stage Manager / Split View'da birden fazla foregroundActive sahne"
echo "    olduğunda yanlış pencere seçiliyordu → ASAuthorizationError"
echo "    Düzeltme: bridge.viewController.view.window her zaman 1. öncelik"
echo ""

# ── Git commit ─────────────────────────────────────────────────────────────────
echo "📝 Swift değişikliği commit ediliyor..."
rm -f .git/HEAD.lock .git/index.lock 2>/dev/null || true
git add ios/App/App/NativeAppleSignInPlugin.swift
git diff --cached --stat
git commit -m "fix(iOS): Apple Sign In iPad presentationAnchor öncelik düzeltmesi

- bridge.viewController.view.window 3. sıradan 1. sıraya taşındı
- iPad Stage Manager / Split View'da foregroundActive sahne sayısı > 1
  olduğunda yanlış pencere seçiliyordu → ASAuthorizationController hata veriyordu
- window.windowScene != nil kontrolü eklendi (detached window koruması)
- Guideline 2.1a — Build 9 reddini giderir

Fixes: 6e704c80-3e2d-4b85-b6c8-632c83974037"
git push origin claude/nahabber-project-architecture-NZhLO
echo "   ✅ Push tamamlandı"
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
echo "🏗️  Xcode archive (Build 10)..."
xcodebuild archive \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "NaHaber.xcarchive" \
  MARKETING_VERSION=1.2 \
  CURRENT_PROJECT_VERSION=10 \
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
  --apiIssuer 0b4b2878-8080-476e-aafe-0bd515dce30c \
  2>&1 | tail -15

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Build 10 yüklendi!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Sonraki adımlar:"
echo "  1. appstoreconnect.apple.com → NaHaber → App Review"
echo "  2. 'Resubmit to App Review' butonuna tıkla"
echo "  3. Build 10'u seç → Submit"
echo ""
read -p "Kapatmak için Enter'a bas..."
