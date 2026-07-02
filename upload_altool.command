#!/bin/bash
set -e

IPA="/Users/user/Downloads/NaHaber_IPA/App.ipa"
APPLE_ID="mehmetsentc@gmail.com"
LOG="/Users/user/Downloads/upload_altool.log"
KEY_P8="/Users/user/nahaber/AuthKey_88PX7Q6W29.p8"
KEY_ID="88PX7Q6W29"
ISSUER_ID="0b4b2878-8080-476e-aafe-0bd515dce30c"

echo "=== NaHaber IPA Upload ===" | tee "$LOG"
echo "Tarih: $(date)" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# Check IPA
ls -lh "$IPA" 2>/dev/null | tee -a "$LOG" || { echo "IPA bulunamadı!"; exit 1; }

echo "" | tee -a "$LOG"
echo "=== Keychain'de Apple kimlik bilgileri aranıyor ===" | tee -a "$LOG"
security find-generic-password -a "$APPLE_ID" 2>&1 | grep -E "(acct|labl|svce)" | tee -a "$LOG" || true

echo "" | tee -a "$LOG"

# Method 1: API key (.p8 file)
if [ -f "$KEY_P8" ]; then
  echo "=== Yöntem 1: API Key (.p8) ===" | tee -a "$LOG"
  xcrun altool --upload-app \
    -f "$IPA" \
    -t ios \
    --apiKey "$KEY_ID" \
    --apiIssuer "$ISSUER_ID" \
    -k "$KEY_P8" \
    --output-format json 2>&1 | tee -a "$LOG"
  EXIT_CODE=${PIPESTATUS[0]}
  if [ $EXIT_CODE -eq 0 ]; then
    echo "" | tee -a "$LOG"
    echo "✅ UPLOAD BAŞARILI (API key ile)!" | tee -a "$LOG"
    exit 0
  fi
  echo "API key ile başarısız, diğer yöntemler deneniyor..." | tee -a "$LOG"
else
  echo "⚠️  API key dosyası bulunamadı: $KEY_P8" | tee -a "$LOG"
  echo "Chrome'daki kaydetme diyaloğunda 'Kaydet'e tıklayın!" | tee -a "$LOG"
fi

echo "" | tee -a "$LOG"

# Method 2: Apple ID + keychain password
echo "=== Yöntem 2: Apple ID + Keychain şifresi ===" | tee -a "$LOG"
# Try common keychain labels for app-specific passwords
for LABEL in "Application Loader: $APPLE_ID" "Xcode: $APPLE_ID" "AC_PASSWORD" "altool"; do
  echo "Deneniyor: @keychain:$LABEL" | tee -a "$LOG"
  xcrun altool --upload-app \
    -f "$IPA" \
    -t ios \
    -u "$APPLE_ID" \
    -p "@keychain:$LABEL" \
    --output-format json 2>&1 | grep -E "(No errors|error|Error)" | head -5 | tee -a "$LOG" || true
done

echo "" | tee -a "$LOG"
echo "=== Tüm yöntemler denendi ===" | tee -a "$LOG"
echo "LOG dosyası: $LOG"

echo ""
echo "Pencereyi kapatmak için Enter'a basın..."
read
