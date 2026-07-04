#!/bin/bash
set -e

# ============================================================
# NaHaber v1.2 Build 5 — Build & Upload
# Düzeltmeler:
#   - Guideline 5.1.1: Konum izni "İzin ver" → "Devam" butonu
#   - Guideline 2.1(a): Apple Sign In iPad iPadOS 26 fix
# ============================================================

PROJECT_DIR="/Users/user/nahaber"
IOS_DIR="$PROJECT_DIR/ios/App"
ARCHIVE_PATH="/Users/user/Downloads/NaHaber_1.2_b5.xcarchive"
EXPORT_DIR="/Users/user/Downloads/NaHaber_IPA_b5"
EXPORT_OPTIONS="$PROJECT_DIR/ExportOptions.plist"
PROFILE_SRC="$PROJECT_DIR/NaHaber_AppStore_2026.mobileprovision"
PROFILE_UUID="2e4d40b4-a18f-4a91-8b90-7004ab7ab8b6"
PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"

KEY_P8="$PROJECT_DIR/AuthKey_88PX7Q6W29.p8"
KEY_ID="88PX7Q6W29"
ISSUER_ID="0b4b2878-8080-476e-aafe-0bd515dce30c"
LOG="/Users/user/Downloads/build_upload_b5.log"

echo "============================================================" | tee "$LOG"
echo "NaHaber v1.2 Build 5 — Build & Upload" | tee -a "$LOG"
echo "Tarih: $(date)" | tee -a "$LOG"
echo "============================================================" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# --- API key kontrolü ---
echo "=== API Key kontrolü ===" | tee -a "$LOG"
if [ ! -f "$KEY_P8" ]; then
  echo "HATA: $KEY_P8 bulunamadı!" | tee -a "$LOG"
  exit 1
fi
echo "✅ API key mevcut" | tee -a "$LOG"

# --- Git commit & push ---
echo "" | tee -a "$LOG"
echo "=== Git commit + push ===" | tee -a "$LOG"
cd "$PROJECT_DIR"
rm -f .git/HEAD.lock .git/index.lock 2>/dev/null || true
git add -A
git commit -m "fix: build script keychain (Build 5)" || echo "Nothing to commit"
git push origin "$(git branch --show-current)" 2>&1 | tee -a "$LOG"
echo "✅ Git push tamamlandı" | tee -a "$LOG"

# --- Capacitor sync ---
echo "" | tee -a "$LOG"
echo "=== Capacitor Sync ===" | tee -a "$LOG"
cd "$PROJECT_DIR"
npx cap sync ios 2>&1 | tee -a "$LOG"
echo "✅ Cap sync tamamlandı" | tee -a "$LOG"

# --- Provisioning profile ---
echo "" | tee -a "$LOG"
echo "=== Provisioning Profile ===" | tee -a "$LOG"
mkdir -p "$PROFILE_DIR"
cp "$PROFILE_SRC" "$PROFILE_DIR/$PROFILE_UUID.mobileprovision"
echo "✅ Profile yüklendi" | tee -a "$LOG"

# --- Login keychain'i aktif/açık tut ---
echo "" | tee -a "$LOG"
echo "=== Keychain unlock ===" | tee -a "$LOG"
security unlock-keychain ~/Library/Keychains/login.keychain-db 2>/dev/null || true
security list-keychains -d user -s ~/Library/Keychains/login.keychain-db
echo "✅ Login keychain aktif" | tee -a "$LOG"

# --- xcodebuild archive (Build 5) ---
# NOT: --keychain flag KULLANILMIYOR — codesign login keychain'i otomatik bulur
echo "" | tee -a "$LOG"
echo "=== Xcode Archive (v1.2 Build 5) ===" | tee -a "$LOG"
rm -rf "$ARCHIVE_PATH"
cd "$IOS_DIR"
xcodebuild archive \
  -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -archivePath "$ARCHIVE_PATH" \
  CURRENT_PROJECT_VERSION=5 \
  MARKETING_VERSION=1.2 \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="33E037D9850E41DFFBD38D1014369C9847FE9A50" \
  PROVISIONING_PROFILE="$PROFILE_UUID" \
  DEVELOPMENT_TEAM="VMZA353GB7" \
  CODE_SIGN_ENTITLEMENTS="App/App.entitlements" \
  2>&1 | tee -a "$LOG"
echo "✅ Archive tamamlandı: $ARCHIVE_PATH" | tee -a "$LOG"

# --- IPA export ---
echo "" | tee -a "$LOG"
echo "=== IPA Export ===" | tee -a "$LOG"
rm -rf "$EXPORT_DIR"
mkdir -p "$EXPORT_DIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  2>&1 | tee -a "$LOG"
echo "✅ IPA export tamamlandı" | tee -a "$LOG"
ls -lh "$EXPORT_DIR" | tee -a "$LOG"

# --- IPA dosyasını bul ---
IPA_FILE=$(find "$EXPORT_DIR" -name "*.ipa" | head -1)
if [ -z "$IPA_FILE" ]; then
  echo "HATA: IPA bulunamadı! Export başarısız." | tee -a "$LOG"
  exit 1
fi
echo "IPA: $IPA_FILE" | tee -a "$LOG"

# --- App Store Connect upload ---
echo "" | tee -a "$LOG"
echo "=== App Store Connect Upload (Build 5) ===" | tee -a "$LOG"
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
echo "✅ TÜM İŞLEMLER TAMAMLANDI — v1.2 Build 5" | tee -a "$LOG"
echo "Log: $LOG" | tee -a "$LOG"
echo "============================================================" | tee -a "$LOG"
echo ""
echo "Sonraki adım — App Store Connect'te:"
echo "1. Build 5 TestFlight'ta işlenince (~15dk) version sayfasına ekle"
echo "2. Resubmit to App Review"
echo "URL: https://appstoreconnect.apple.com/apps/6784465855/distribution"
echo ""
echo "PENCEREYI KAPATMAK İÇİN ENTER'A BAS..."
read
