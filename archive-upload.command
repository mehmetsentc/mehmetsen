#!/bin/bash
# NaHaber — Archive ve App Store Connect'e Yükle
set -e

PROJECT="$HOME/nahaber/ios/App/App.xcodeproj"
ARCHIVE="$HOME/nahaber/NaHaber.xcarchive"
EXPORT_DIR="$HOME/nahaber/ipa"
EXPORT_OPTIONS="$HOME/nahaber/ExportOptions.plist"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NaHaber — iOS Archive & Upload"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Archive
echo "🔐 Sertifika Keychain'e ekleniyor..."
security import "$HOME/nahaber/ios_distribution.p12" \
  -P "" \
  -A \
  -k ~/Library/Keychains/login.keychain-db 2>/dev/null || \
security import "$HOME/nahaber/ios_distribution.p12" \
  -P "" \
  -A 2>/dev/null || true
echo "✅ Sertifika hazır:"
security find-identity -v -p codesigning 2>/dev/null | head -5

echo ""
echo "📦 Archive alınıyor (birkaç dakika sürebilir)..."
xcodebuild \
  -project "$PROJECT" \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE" \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=VMZA353GB7 \
  -allowProvisioningUpdates \
  archive

echo ""
echo "✅ Archive tamamlandı: $ARCHIVE"
echo ""

# 2. Export & Upload
echo "🚀 App Store Connect'e yükleniyor..."
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -exportPath "$EXPORT_DIR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ İşlem tamamlandı!"
echo "  IPA: $EXPORT_DIR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
