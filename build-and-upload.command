#!/bin/bash
# NaHaber — Manual signing ile Archive & App Store Connect Upload

set -e

PROFILE_UUID="b57b305d-5c22-4ea6-9203-64925af77bf0"
PROFILE_SRC="$HOME/nahaber/firestore.rules.mobileprovision"
PROFILE_DEST="$HOME/Library/MobileDevice/Provisioning Profiles/$PROFILE_UUID.mobileprovision"
PROJECT="$HOME/nahaber/ios/App/App.xcodeproj"
ARCHIVE="$HOME/nahaber/NaHaber.xcarchive"
EXPORT_DIR="$HOME/nahaber/ipa"
EXPORT_OPTIONS="$HOME/nahaber/ExportOptions.plist"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NaHaber — Build & Upload"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Provisioning profile yükle
echo "📋 Provisioning profile kuruluyor..."
mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
cp "$PROFILE_SRC" "$PROFILE_DEST"
echo "  ✅ Profil kuruldu: $PROFILE_DEST"

# 2. Codesigning kontrolü
echo ""
echo "🔑 Codesigning kimlikleri:"
security find-identity -v -p codesigning | grep -E "Apple (Distribution|Development)"

# 3. Eski archive sil
rm -rf "$ARCHIVE"
rm -rf "$EXPORT_DIR"
echo ""
echo "🗑️  Eski archive temizlendi"

# 4. Archive (Manual signing)
echo ""
echo "📦 Archive alınıyor... (5-10 dakika sürebilir)"
xcodebuild \
  -project "$PROJECT" \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  PROVISIONING_PROFILE_SPECIFIER="NaHaber App Store Distribution" \
  DEVELOPMENT_TEAM=VMZA353GB7 \
  archive 2>&1 | tee "$HOME/nahaber/archive.log"

BUILD_EXIT=${PIPESTATUS[0]}
if [ $BUILD_EXIT -ne 0 ]; then
  echo ""
  echo "❌ Archive başarısız! Son hatalar:"
  tail -20 "$HOME/nahaber/archive.log"
  exit 1
fi

echo ""
echo "✅ Archive tamamlandı: $ARCHIVE"

# 5. Export & Upload
echo ""
echo "🚀 App Store Connect'e yükleniyor..."
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -exportPath "$EXPORT_DIR" 2>&1 | tee -a "$HOME/nahaber/archive.log"

if [ ${PIPESTATUS[0]} -eq 0 ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ✅ Yükleme tamamlandı!"
  echo "  IPA: $EXPORT_DIR"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  echo "❌ Upload başarısız! Log: $HOME/nahaber/archive.log"
  exit 1
fi
