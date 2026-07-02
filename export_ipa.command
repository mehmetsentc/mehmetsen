#!/bin/bash
set -e

ARCHIVE="/Users/user/Downloads/NaHaber_1.1.xcarchive"
EXPORT_DIR="/Users/user/Downloads/NaHaber_IPA"
EXPORT_OPTIONS="/Users/user/nahaber/ExportOptions.plist"
BUILD_KEYCHAIN="/tmp/nahaber_build.keychain-db"
BUILD_KP="NaHaber_Build_2026"
PROFILE_CERT="/Users/user/Downloads/cert_work/profile_cert.der"
KEY_FILE="/Users/user/Downloads/cert_work/distribution_private.key"

echo "=== IPA Export Başlıyor ==="
echo "Tarih: $(date)"

# Build keychain'i hazırla (archive sonrası silinmiş olabilir)
security delete-keychain "$BUILD_KEYCHAIN" 2>/dev/null || true
security create-keychain -p "$BUILD_KP" "$BUILD_KEYCHAIN"
security set-keychain-settings -lut 21600 "$BUILD_KEYCHAIN"
security unlock-keychain -p "$BUILD_KP" "$BUILD_KEYCHAIN"
security import "$PROFILE_CERT" -k "$BUILD_KEYCHAIN" -T /usr/bin/codesign -T /usr/bin/security -A 2>&1
security import "$KEY_FILE" -k "$BUILD_KEYCHAIN" -T /usr/bin/codesign -T /usr/bin/security -A 2>&1
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$BUILD_KP" "$BUILD_KEYCHAIN"
security list-keychains -d user -s "$BUILD_KEYCHAIN" ~/Library/Keychains/login.keychain-db

rm -rf "$EXPORT_DIR"
mkdir -p "$EXPORT_DIR"

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  OTHER_CODE_SIGN_FLAGS="--keychain $BUILD_KEYCHAIN" \
  | tee /Users/user/Downloads/xcodebuild_export.log

echo ""
echo "=== Export Tamamlandı ==="
ls -lh "$EXPORT_DIR"

# Keychain listesini eski haline döndür
security list-keychains -d user -s ~/Library/Keychains/login.keychain-db
