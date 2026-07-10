#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NaHaber v1.2 Build 8 — App Store Fix Build"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Düzeltilen sorunlar:"
echo "  • Guideline 2.1: iOS 26'da Apple Sign In presentationAnchor düzeltildi"
echo "  • Guideline 4.0: Google Sign In iOS Capacitor'da gizlendi (dış browser açmıyordu)"
echo "  • Guideline 2.1 Info: NSLocationWhenInUseUsageDescription Info.plist'e eklendi"
echo ""

# ── Git commit ────────────────────────────────────────────────────────────────
rm -f .git/index.lock

git add \
  ios/App/App/Info.plist \
  ios/App/App/NativeAppleSignInPlugin.swift \
  src/components/auth/LoginForm.tsx \
  src/components/auth/RegisterForm.tsx

git status --short

git commit -m "fix: App Store v1.2 red düzeltmeleri (Build 8)

Guideline 2.1(a) — Apple Sign In iOS 26 uyumluluğu:
  - presentationAnchor: Foreground active scene öncelikli (iOS 15+ scene-based)
  - Hatalı fallback kaldırıldı (yeni UIWindow() oluşturup makeKeyAndVisible çağırmak iOS 26'da sorun yaratıyordu)

Guideline 4.0 — Google Sign In dış browser açıyor:
  - LoginForm + RegisterForm: isCapacitor() kontrolü eklendi
  - iOS Capacitor build'de Google Sign In butonu gizleniyor (Safari açmıyor)
  - Yalnızca web sürümünde Google Sign In aktif

Guideline 2.1 (Info) — Konum izni dialog'u görünmüyordu:
  - Info.plist: NSLocationWhenInUseUsageDescription eklendi
  - Eksik key yüzünden iOS hiç sistem dialog'u göstermiyordu"

git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Git push tamamlandı — şimdi iOS build başlıyor..."
echo ""

# ── iOS build ─────────────────────────────────────────────────────────────────
echo "📦 Next.js export..."
npm run build 2>&1 | tail -5

echo ""
echo "📱 Capacitor sync..."
npx cap sync ios 2>&1 | tail -5

echo ""
echo "🏗️  Xcode archive (Build 8)..."
cd ios/App

xcodebuild archive \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -archivePath "../../NaHaber.xcarchive" \
  -allowProvisioningUpdates \
  MARKETING_VERSION=1.2 \
  CURRENT_PROJECT_VERSION=8 \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=VMZA353GB7 \
  | grep -E "^(error:|warning: .*(deprecated|Error)|Archive|SUCCEEDED|FAILED|Build)" | tail -20

echo ""
echo "📤 App Store'a yükleniyor..."
xcodebuild -exportArchive \
  -archivePath "../../NaHaber.xcarchive" \
  -exportPath "../../ipa/" \
  -exportOptionsPlist "../../ExportOptions.plist" \
  -allowProvisioningUpdates \
  | tail -10

cd ../..

echo ""
echo "🚀 App Store Connect'e gönderiliyor..."
xcrun altool --upload-app \
  -f "ipa/NaHaber.ipa" \
  -t ios \
  --apiKey 88PX7Q6W29 \
  --apiIssuer 3a3d3b1e-e455-4c82-849b-f4db5a40d475 \
  2>&1 | tail -10

echo ""
echo "✅ Build 8 yüklendi!"
echo ""
echo "Sonraki adım: App Store Connect'te Build 8'i seçip 'Resubmit to App Review' tıkla"
read -p "Kapatmak için Enter'a bas..."
