#!/bin/bash
# NaHaber — Android Release Keystore Oluştur
# ⚠️  BU DOSYAYI SAKLAYIN! Kaybolursa uygulama güncelleyemezsiniz.

set -e
cd "$(dirname "$0")"

KEYSTORE_FILE="android/app/nahaber-release.keystore"
KEYSTORE_ALIAS="nahaber"

echo "======================================"
echo "  NaHaber Keystore Oluşturucu"
echo "======================================"
echo ""
echo "⚠️  Oluşturulan keystore'u güvenli bir yere yedekleyin!"
echo "   (iCloud, harici disk, vs.)"
echo ""

# Şifre iste
read -s -p "Keystore şifresi (en az 6 karakter): " KS_PASS
echo ""
read -s -p "Şifreyi tekrar girin: " KS_PASS2
echo ""

if [ "$KS_PASS" != "$KS_PASS2" ]; then
  echo "❌ Şifreler eşleşmiyor!"
  exit 1
fi

# Keystore oluştur
echo ""
echo "Keystore oluşturuluyor..."

keytool -genkey -v \
  -keystore "$KEYSTORE_FILE" \
  -alias "$KEYSTORE_ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass "$KS_PASS" \
  -keypass "$KS_PASS" \
  -dname "CN=NaHaber, OU=Mobile, O=NaHaber, L=Lefkosa, ST=Kibris, C=CY"

echo ""
echo "✅ Keystore oluşturuldu: $KEYSTORE_FILE"
echo ""

# keystore.properties dosyası oluştur
cat > android/keystore.properties << EOF
storeFile=nahaber-release.keystore
storePassword=$KS_PASS
keyAlias=$KEYSTORE_ALIAS
keyPassword=$KS_PASS
EOF

echo "✅ android/keystore.properties oluşturuldu"
echo ""
echo "======================================"
echo "  ⚠️  ÖNEMLI: Yedekleme Yapın!"
echo "======================================"
echo "  $KEYSTORE_FILE"
echo "  android/keystore.properties"
echo ""
echo "Sonraki adım: build_android_release.command çalıştır"
echo ""
