#!/bin/bash
set -e

# ============================================================
# NaHaber v1.1 Build 3 — Rebuild & Upload
# Düzeltme: iPad'de "Take Photo" crash fix (capture= kaldırıldı)
# ============================================================

PROJECT_DIR="/Users/user/nahaber"
IOS_DIR="$PROJECT_DIR/ios/App"
ARCHIVE_PATH="/Users/user/Downloads/NaHaber_1.1_b3.xcarchive"
EXPORT_DIR="/Users/user/Downloads/NaHaber_IPA_b3"
EXPORT_OPTIONS="$PROJECT_DIR/ExportOptions.plist"
PROFILE_CERT="/Users/user/Downloads/cert_work/profile_cert.der"
KEY_FILE="/Users/user/Downloads/cert_work/distribution_private.key"
PROFILE_SRC="$PROJECT_DIR/NaHaber_AppStore_2026.mobileprovision"
PROFILE_UUID="2e4d40b4-a18f-4a91-8b90-7004ab7ab8b6"
PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
BUILD_KEYCHAIN="/tmp/nahaber_build3.keychain-db"
BUILD_KP="NaHaber_Build_2026"

KEY_P8="$PROJECT_DIR/AuthKey_88PX7Q6W29.p8"
KEY_ID="88PX7Q6W29"
ISSUER_ID="0b4b2878-8080-476e-aafe-0bd515dce30c"
LOG="/Users/user/Downloads/rebuild_upload_b3.log"

echo "============================================================" | tee "$LOG"
echo "NaHaber v1.1 Build 3 — Rebuild & Upload" | tee -a "$LOG"
echo "Tarih: $(date)" | tee -a "$LOG"
echo "============================================================" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# --- API key kontrolü ---
echo "=== API Key kontrolü ===" | tee -a "$LOG"
if [ ! -f "$KEY_P8" ]; then
  echo "HATA: $KEY_P8 bulunamadı!" | tee -a "$LOG"
  echo "Chrome'daki save diyalogunda 'Kaydet' tıklayıp tekrar çalıştırın." | tee -a "$LOG"
  echo ""
  echo "DEVAM ETMEK İÇİN ENTER'A BASIN..."
  read
  exit 1
fi
echo "✅ API key mevcut: $KEY_P8" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# --- Capacitor sync ---
echo "=== Capacitor Sync ===" | tee -a "$LOG"
cd "$PROJECT_DIR"
npx cap sync ios 2>&1 | tee -a "$LOG"
echo "✅ Cap sync tamamlandı" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# --- Provisioning profile ---
echo "=== Provisioning Profile ===" | tee -a "$LOG"
mkdir -p "$PROFILE_DIR"
cp "$PROFILE_SRC" "$PROFILE_DIR/$PROFILE_UUID.mobileprovision"
echo "✅ Profile yüklendi: $PROFILE_UUID" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# --- Build Keychain ---
echo "=== Build Keychain ===" | tee -a "$LOG"
security delete-keychain "$BUILD_KEYCHAIN" 2>/dev/null || true
security create-keychain -p "$BUILD_KP" "$BUILD_KEYCHAIN"
security set-keychain-settings -lut 21600 "$BUILD_KEYCHAIN"
security unlock-keychain -p "$BUILD_KP" "$BUILD_KEYCHAIN"
security import "$PROFILE_CERT" -k "$BUILD_KEYCHAIN" -T /usr/bin/codesign -T /usr/bin/security -A 2>&1 | tee -a "$LOG"
security import "$KEY_FILE" -k "$BUILD_KEYCHAIN" -T /usr/bin/codesign -T /usr/bin/security -A 2>&1 | tee -a "$LOG"
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$BUILD_KP" "$BUILD_KEYCHAIN"
security list-keychains -d user -s "$BUILD_KEYCHAIN" ~/Library/Keychains/login.keychain-db
echo "✅ Build keychain hazır" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# --- xcodebuild archive ---
echo "=== Xcode Archive (Build 3) ===" | tee -a "$LOG"
rm -rf "$ARCHIVE_PATH"
cd "$IOS_DIR"
xcodebuild archive \
  -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -archivePath "$ARCHIVE_PATH" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="33E037D9850E41DFFBD38D1014369C9847FE9A50" \
  PROVISIONING_PROFILE="$PROFILE_UUID" \
  DEVELOPMENT_TEAM="VMZA353GB7" \
  OTHER_CODE_SIGN_FLAGS="--keychain $BUILD_KEYCHAIN" \
  2>&1 | tee -a "$LOG"
echo "✅ Archive tamamlandı: $ARCHIVE_PATH" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# --- IPA export ---
echo "=== IPA Export ===" | tee -a "$LOG"
rm -rf "$EXPORT_DIR"
mkdir -p "$EXPORT_DIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  OTHER_CODE_SIGN_FLAGS="--keychain $BUILD_KEYCHAIN" \
  2>&1 | tee -a "$LOG"
echo "✅ IPA export tamamlandı" | tee -a "$LOG"
ls -lh "$EXPORT_DIR" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# Keychain'i eski haline döndür
security list-keychains -d user -s ~/Library/Keychains/login.keychain-db

# --- IPA dosyasını bul ---
IPA_FILE=$(find "$EXPORT_DIR" -name "*.ipa" | head -1)
if [ -z "$IPA_FILE" ]; then
  echo "HATA: IPA dosyası bulunamadı!" | tee -a "$LOG"
  exit 1
fi
echo "IPA: $IPA_FILE" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# --- App Store Connect upload ---
echo "=== App Store Connect Upload ===" | tee -a "$LOG"
xcrun altool --upload-app \
  -f "$IPA_FILE" \
  -t ios \
  --apiKey "$KEY_ID" \
  --apiIssuer "$ISSUER_ID" \
  -k "$KEY_P8" \
  --output-format json \
  2>&1 | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "============================================================" | tee -a "$LOG"
echo "✅ TÜM İŞLEMLER TAMAMLANDI!" | tee -a "$LOG"
echo "Log: $LOG" | tee -a "$LOG"
echo "============================================================" | tee -a "$LOG"
echo ""
echo "Şimdi App Store Connect'e git:"
echo "https://appstoreconnect.apple.com/apps/6784465855/distribution"
echo ""
echo "PENCEREYI KAPATMAK İÇİN ENTER'A BAS..."
read
