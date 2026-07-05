#!/bin/bash
# NaHaber — Archive + Export + App Store Connect'e Yükle
# Manual signing — "NaHaber AppStore 2026" profili kullanır
set -e

PROJECT="$HOME/nahaber/ios/App/App.xcodeproj"
ARCHIVE="$HOME/nahaber/NaHaber.xcarchive"
EXPORT_DIR="$HOME/nahaber/ipa"
EXPORT_OPTIONS="$HOME/nahaber/ExportOptions.plist"
KEY_P8="$HOME/nahaber/AuthKey_88PX7Q6W29.p8"
KEY_ID="88PX7Q6W29"
ISSUER_ID="0b4b2878-8080-476e-aafe-0bd515dce30c"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NaHaber — iOS Archive & Upload"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Sertifika yükle
echo "🔐 Sertifika Keychain'e ekleniyor..."
security import "$HOME/nahaber/ios_distribution.p12" \
  -P "" -A -k ~/Library/Keychains/login.keychain-db 2>/dev/null || true
echo "✅ Sertifikalar:"
security find-identity -v -p codesigning 2>/dev/null | head -5

echo ""
echo "📦 Archive alınıyor (Build 6)..."
rm -rf "$ARCHIVE"

xcodebuild \
  -project "$PROJECT" \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  PROVISIONING_PROFILE_SPECIFIER="NaHaber AppStore 2026" \
  DEVELOPMENT_TEAM=VMZA353GB7 \
  -authenticationKeyPath "$KEY_P8" \
  -authenticationKeyID "$KEY_ID" \
  -authenticationKeyIssuerID "$ISSUER_ID" \
  archive

echo ""
echo "✅ Archive tamamlandı: $ARCHIVE"
echo ""

# 2. Export
echo "📤 IPA export ediliyor..."
rm -rf "$EXPORT_DIR"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -exportPath "$EXPORT_DIR" \
  -authenticationKeyPath "$KEY_P8" \
  -authenticationKeyID "$KEY_ID" \
  -authenticationKeyIssuerID "$ISSUER_ID"

echo ""
echo "✅ Export tamamlandı: $EXPORT_DIR"
echo ""

# 3. IPA dosyasını bul
IPA_FILE=$(find "$EXPORT_DIR" -name "*.ipa" | head -1)
if [ -z "$IPA_FILE" ]; then
  echo "❌ IPA dosyası bulunamadı: $EXPORT_DIR"
  exit 1
fi
echo "📱 IPA: $IPA_FILE"
ls -lh "$IPA_FILE"
echo ""

# 4. App Store Connect'e yükle
echo "🚀 App Store Connect'e yükleniyor..."
xcrun altool \
  --upload-app \
  -f "$IPA_FILE" \
  -t ios \
  --apiKey "$KEY_ID" \
  --apiIssuer "$ISSUER_ID" \
  -k "$KEY_P8" \
  --output-format json

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ UPLOAD BAŞARILI!"
echo "  App Store Connect'te Build 6 görünecek"
echo "  Şimdi: appstoreconnect.apple.com → NaHaber"
echo "  → Submission → Build seç → Resubmit"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Kapatmak için Enter'a basın..."
read
