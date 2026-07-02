#!/bin/bash
set -e

IPA="/Users/user/Downloads/NaHaber_IPA_b3/App.ipa"
KEY_P8="/Users/user/nahaber/AuthKey_88PX7Q6W29.p8"
KEY_ID="88PX7Q6W29"
ISSUER_ID="0b4b2878-8080-476e-aafe-0bd515dce30c"
LOG="/Users/user/Downloads/upload_b3.log"

echo "=== NaHaber Build 3 Upload ===" | tee "$LOG"
echo "Tarih: $(date)" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# IPA kontrolü
ls -lh "$IPA" | tee -a "$LOG"

# .p8 dosyasını altool'un aradığı standart konuma kopyala
PRIVKEYS_DIR="$HOME/.appstoreconnect/private_keys"
mkdir -p "$PRIVKEYS_DIR"
cp "$KEY_P8" "$PRIVKEYS_DIR/AuthKey_${KEY_ID}.p8"
echo "✅ API key kopyalandı: $PRIVKEYS_DIR/AuthKey_${KEY_ID}.p8" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# Upload — -k olmadan (altool kendi konumda arar)
echo "=== App Store Connect'e yükleniyor ===" | tee -a "$LOG"
xcrun altool --upload-app \
  -f "$IPA" \
  -t ios \
  --apiKey "$KEY_ID" \
  --apiIssuer "$ISSUER_ID" \
  --output-format json \
  2>&1 | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "✅ UPLOAD TAMAMLANDI!" | tee -a "$LOG"
echo "Log: $LOG" | tee -a "$LOG"
echo ""
echo "Şimdi App Store Connect'e git:"
echo "https://appstoreconnect.apple.com/apps/6784465855/distribution"
echo ""
echo "PENCEREYI KAPATMAK İÇİN ENTER'A BAS..."
read
