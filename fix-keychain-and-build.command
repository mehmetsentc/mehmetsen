#!/bin/bash
# NaHaber — Keychain partition düzelt + Archive

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NaHaber — Keychain Fix & Archive"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
PROFILE_UUID="b57b305d-5c22-4ea6-9203-64925af77bf0"
PROFILE_SRC="$HOME/nahaber/firestore.rules.mobileprovision"
PROFILE_DEST="$HOME/Library/MobileDevice/Provisioning Profiles/$PROFILE_UUID.mobileprovision"
PROJECT="$HOME/nahaber/ios/App/App.xcodeproj"
ARCHIVE="$HOME/nahaber/NaHaber.xcarchive"
EXPORT_DIR="$HOME/nahaber/ipa"
EXPORT_OPTIONS="$HOME/nahaber/ExportOptions.plist"

# macOS login parolasını GUI dialog ile al
echo "🔑 macOS login parolası isteniyor..."
PASSWORD=$(osascript -e 'display dialog "NaHaber build için macOS login şifrenizi girin:" default answer "" with hidden answer buttons {"İptal", "Tamam"} default button "Tamam"' -e 'text returned of result' 2>/dev/null)

if [ -z "$PASSWORD" ]; then
  echo "❌ Şifre girilmedi veya iptal edildi."
  exit 1
fi

echo "✅ Şifre alındı"

# Keychain partition list düzelt (codesign erişimi ver)
echo ""
echo "🔓 Keychain partition list güncelleniyor..."
security set-key-partition-list \
  -S apple-tool:,apple:,codesign: \
  -s \
  -k "$PASSWORD" \
  "$KEYCHAIN" 2>&1 && echo "  ✅ Partition list güncellendi" || {
    echo "  ⚠️  Partition list güncellenemedi, devam ediliyor..."
  }

# Keychain unlock
security unlock-keychain -p "$PASSWORD" "$KEYCHAIN" 2>/dev/null && echo "  ✅ Keychain açıldı" || true

# Provisioning profile kur
echo ""
echo "📋 Provisioning profile kuruluyor..."
mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
cp "$PROFILE_SRC" "$PROFILE_DEST"
echo "  ✅ Profil kuruldu"

# Kimlik kontrolü
echo ""
echo "🔑 Codesigning kimlikleri:"
security find-identity -v -p codesigning | grep -E "Apple (Distribution|Development)"

# Eski archive temizle
rm -rf "$ARCHIVE" "$EXPORT_DIR"

# Archive
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
  OTHER_CODE_SIGN_FLAGS="--keychain $KEYCHAIN" \
  archive 2>&1 | tee "$HOME/nahaber/archive.log"

BUILD_EXIT=${PIPESTATUS[0]}

if [ $BUILD_EXIT -ne 0 ]; then
  echo ""
  echo "❌ Archive başarısız! Son hatalar:"
  grep -E "error:|FAILED" "$HOME/nahaber/archive.log" | tail -10
  exit 1
fi

echo ""
echo "✅ Archive tamamlandı!"

# Export & Upload
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
  echo "  ✅ App Store Connect'e yüklendi!"
  echo "  IPA: $EXPORT_DIR"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  echo "❌ Upload başarısız!"
  exit 1
fi
