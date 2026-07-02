#!/bin/bash
# Apple Distribution sertifikasını Keychain'e yükle ve archive oluştur

echo "=== Apple Distribution Sertifikası Kurulum ve Archive ==="
echo "Tarih: $(date)"
echo ""

CER_SRC="/Users/user/Downloads/.com.google.Chrome.375EWJ"
CER_DEST="/Users/user/Downloads/cert_work/apple_distribution.cer"
KEY_FILE="/Users/user/Downloads/cert_work/distribution_private.key"
ARCHIVE_PATH="/Users/user/Downloads/NaHaber_1.1.xcarchive"

# 1. .cer dosyasını kopyala
echo "1. Sertifika hazırlanıyor..."
cp "$CER_SRC" "$CER_DEST"
echo "   OK: $CER_DEST"

# 2. Sertifikayı Keychain'e yükle
echo ""
echo "2. Sertifika Keychain'e yükleniyor..."
security import "$CER_DEST" \
  -k ~/Library/Keychains/login.keychain-db \
  -A \
  2>&1

# 3. Private key'i Keychain'e yükle
echo ""
echo "3. Private key Keychain'e yükleniyor..."
security import "$KEY_FILE" \
  -k ~/Library/Keychains/login.keychain-db \
  -A \
  2>&1

# 4. Yüklenen identities'ı göster
echo ""
echo "4. Mevcut signing identities:"
security find-identity -v -p codesigning 2>&1 | grep -E "Apple Distribution|valid|VMZA" | head -10

# 5. Eski archive varsa sil
if [ -d "$ARCHIVE_PATH" ]; then
  echo ""
  echo "5. Eski archive siliniyor..."
  rm -rf "$ARCHIVE_PATH"
fi

# 6. Archive
echo ""
echo "6. Xcode Archive başlıyor..."
cd /Users/user/nahaber/ios/App

xcodebuild archive \
  -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="VMZA353GB7" \
  | tee /Users/user/Downloads/xcodebuild_archive2.log

RESULT=${PIPESTATUS[0]}
echo ""
if [ $RESULT -eq 0 ]; then
  echo "✅ Archive başarılı!"
  echo "Archive konumu: $ARCHIVE_PATH"
else
  echo "❌ Archive başarısız. Log inceleniyor..."
  tail -30 /Users/user/Downloads/xcodebuild_archive2.log
fi
