#!/bin/bash
set -e

IPA="/Users/user/Downloads/NaHaber_IPA/App.ipa"
APPLE_ID="mehmetsentc@gmail.com"
LOG="/Users/user/Downloads/upload_ipa.log"

echo "=== NaHaber IPA Upload ===" | tee "$LOG"
echo "Tarih: $(date)" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# Verify IPA exists
if [ ! -f "$IPA" ]; then
  echo "HATA: IPA dosyası bulunamadı: $IPA" | tee -a "$LOG"
  exit 1
fi
echo "IPA dosyası: $IPA ($(du -sh "$IPA" | cut -f1))" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# Check keychain for any stored app-specific passwords
echo "=== Keychain Tarama ===" | tee -a "$LOG"
security find-generic-password -a "$APPLE_ID" -s "Application Loader: $APPLE_ID" 2>&1 | tee -a "$LOG" || true
security find-generic-password -s "com.apple.gs.appleid.auth" 2>&1 | grep -E "(acct|labl)" | tee -a "$LOG" || true

# Try xcrun altool using app-specific password from keychain
echo "" | tee -a "$LOG"
echo "=== Upload Deneme 1: Keychain uygulama şifresi ===" | tee -a "$LOG"
xcrun altool --upload-app \
  -f "$IPA" \
  -t ios \
  -u "$APPLE_ID" \
  -p "@keychain:Application Loader: $APPLE_ID" \
  --output-format json 2>&1 | tee -a "$LOG" || {
  echo "Deneme 1 başarısız, deneme 2..." | tee -a "$LOG"

  # Try with generic apple keychain item
  echo "" | tee -a "$LOG"
  echo "=== Upload Deneme 2: ALTOOL_APP_PASSWORD çevre değişkeni ===" | tee -a "$LOG"
  if [ -n "$ALTOOL_APP_PASSWORD" ]; then
    xcrun altool --upload-app \
      -f "$IPA" \
      -t ios \
      -u "$APPLE_ID" \
      -p "$ALTOOL_APP_PASSWORD" \
      --output-format json 2>&1 | tee -a "$LOG"
  else
    echo "ALTOOL_APP_PASSWORD tanımlı değil." | tee -a "$LOG"
  fi
}

echo "" | tee -a "$LOG"
echo "=== Tamamlandı ===" | tee -a "$LOG"
echo "Log: $LOG" | tee -a "$LOG"

# Keep window open
echo ""
echo "Pencereyi kapatmak için Enter'a basın..."
read
