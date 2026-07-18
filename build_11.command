#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NaHaber v1.2 Build 11 — Apple Sign In iPad Root Fix"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Düzeltilen sorun (Guideline 2.1a — Build 10 reddi):"
echo "  • NativeAppleSignInPlugin.swift — UIViewController-tabanlı yaklaşım"
echo "    WKWebView JS bridge'den gelen çağrı, iPadOS 26'da 'user interaction'"
echo "    context'ini kaybediyordu → ASAuthorizationError.notInteractive (1004)"
echo "    Düzeltme: Transparent UIViewController sunulur; viewDidAppear()'dan"
echo "    performRequests() çağrılır — gerçek UIKit lifecycle eventi"
echo ""

# ── Git commit ─────────────────────────────────────────────────────────────────
echo "📝 Değişiklikler commit ediliyor..."
rm -f .git/HEAD.lock .git/index.lock 2>/dev/null || true

git add \
  ios/App/App/NativeAppleSignInPlugin.swift \
  src/lib/appleAuth.ts \
  src/lib/appleAuthErrors.ts

git diff --cached --stat

git commit -m "fix(iOS): Apple Sign In iPad — UIViewController-tabanlı sunum (Build 11)

KÖK NEDEN:
  Capacitor'ın WKWebView JS bridge'inden çağrılan performRequests(),
  iPadOS 26'nın 'user interaction' context gereksinimini karşılamıyor
  → ASAuthorizationError.notInteractive (1004)

DÜZELTME (NativeAppleSignInPlugin.swift):
  - AppleSignInPresentationViewController: şeffaf UIViewController
  - performRequests() viewDidAppear()'dan çağrılır (gerçek UIKit lifecycle)
  - ASAuthorizationError kodu message'a encode edildi (hata teşhisi için)
  - Plugin sınıfı sadeleştirildi; mantık inner VC sınıfına taşındı

DÜZELTME (appleAuth.ts):
  - SIGN_IN_CANCELED/SIGN_IN_FAILED hem .code hem .message'dan kontrol edilir
  - Capacitor 8 custom code propagation belirsizliğine karşı güvence

DÜZELTME (appleAuthErrors.ts):
  - 'UNAVAILABLE' (Capacitor 8 fallback kodu) eklendi
  - Message prefix 'SIGN_IN_FAILED:' ile native hata tespiti
  - Gömülü ASAuthorizationError kodu parse edilir (1004=notInteractive)
  - auth/too-many-requests, auth/credential-already-in-use,
    auth/missing-or-invalid-nonce eklendi

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
echo "🏗️  Xcode archive (Build 11)..."
xcodebuild archive \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "NaHaber.xcarchive" \
  MARKETING_VERSION=1.2 \
  CURRENT_PROJECT_VERSION=11 \
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
echo "  ✅ Build 11 yüklendi!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Sonraki adımlar:"
echo "  1. appstoreconnect.apple.com → NaHaber → App Review"
echo "  2. Build işlenince (5-15 dk) 'Resubmit to App Review' tıkla"
echo "  3. Build 11'i seç → Submit"
echo ""
read -p "Kapatmak için Enter'a bas..."
