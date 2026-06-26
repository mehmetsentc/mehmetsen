#!/bin/bash
# NaHaber — Sertifika sorununu çöz ve Archive al
set -e

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NaHaber — Sertifika Düzelt & Archive"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
cd "$HOME/nahaber"

echo "🔍 Sistem openssl sürümü:"
which openssl && openssl version

# Homebrew OpenSSL var mı?
OPENSSL_BIN="openssl"
for path in /opt/homebrew/bin/openssl /usr/local/bin/openssl; do
  if [ -f "$path" ]; then
    OPENSSL_BIN="$path"
    echo "✅ Homebrew OpenSSL bulundu: $OPENSSL_BIN ($($path version))"
    break
  fi
done

# 1. Önce combined PEM oluştur (cert + key birlikte)
echo ""
echo "📝 Combined PEM oluşturuluyor (sertifika + anahtar)..."
cat ios_distribution.pem distribution.key > ios_distribution_combined.pem
echo "✅ Combined PEM oluşturuldu:"
ls -la ios_distribution_combined.pem

# 2. Yeni PKCS12 oluştur (SHA1 uyumlu)
echo ""
echo "🔧 SHA-1 uyumlu PKCS12 oluşturuluyor..."

# Önce SHA1 PBE ile dene
$OPENSSL_BIN pkcs12 -export \
  -inkey distribution.key \
  -in ios_distribution.pem \
  -out ios_dist_sha1.p12 \
  -passout pass:nahaber123 \
  -certpbe PBE-SHA1-3DES \
  -keypbe PBE-SHA1-3DES \
  -macalg sha1 2>&1 && echo "✅ SHA1-PBE .p12 oluşturuldu" || \
$OPENSSL_BIN pkcs12 -export \
  -inkey distribution.key \
  -in ios_distribution.pem \
  -out ios_dist_sha1.p12 \
  -passout pass:nahaber123 \
  -legacy 2>&1 && echo "✅ Legacy .p12 oluşturuldu" || \
$OPENSSL_BIN pkcs12 -export \
  -inkey distribution.key \
  -in ios_distribution.pem \
  -out ios_dist_sha1.p12 \
  -passout pass:nahaber123 2>&1 && echo "✅ Standart .p12 oluşturuldu"

echo "SHA1 p12 dosyası:"
ls -la ios_dist_sha1.p12 2>/dev/null || echo "❌ Oluşturulamadı"

# 3. Mevcut sertifikaları temizle
echo ""
echo "🧹 Mevcut sertifikalar temizleniyor..."
security delete-certificate -c "Apple Distribution: Mehmet en (VMZA353GB7)" "$KEYCHAIN" 2>/dev/null || true

# 4. Farklı yollarla import dene
echo ""
echo "📥 Sertifika import denemeleri:"

echo "  Deneme 1: SHA1 p12 (parola: nahaber123)..."
security import ios_dist_sha1.p12 \
  -P "nahaber123" \
  -A \
  -k "$KEYCHAIN" 2>&1 || echo "  ❌ Başarısız"

echo ""
echo "  Deneme 2: Combined PEM (cert+key beraber)..."
security import ios_distribution_combined.pem \
  -A \
  -k "$KEYCHAIN" 2>&1 || echo "  ❌ Başarısız"

echo ""
echo "  Deneme 3: Sadece .cer (DER format)..."
security import ios_distribution.cer \
  -A \
  -k "$KEYCHAIN" 2>&1 || echo "  ❌ Başarısız"

echo ""
echo "  Deneme 4: Sadece .key (RSA özel anahtar)..."
security import distribution.key \
  -A \
  -k "$KEYCHAIN" 2>&1 || echo "  ❌ Başarısız"

# 5. Tüm kimlikler
echo ""
echo "📋 TÜM Keychain kimlikleri (codesigning):"
security find-identity -v -p codesigning

echo ""
echo "📋 TÜM sertifikalar:"
security find-identity -v | grep -i "distribution\|apple" || echo "  (yok)"

# 6. Kontrol ve Archive
echo ""
if security find-identity -v -p codesigning | grep -q "Apple Distribution"; then
  echo "✅ Apple Distribution sertifikası Keychain'de hazır!"
  echo ""
  echo "📦 Archive alınıyor..."
  xcodebuild \
    -project "$HOME/nahaber/ios/App/App.xcodeproj" \
    -scheme App \
    -configuration Release \
    -destination "generic/platform=iOS" \
    -archivePath "$HOME/nahaber/NaHaber.xcarchive" \
    CODE_SIGN_STYLE=Automatic \
    DEVELOPMENT_TEAM=VMZA353GB7 \
    -allowProvisioningUpdates \
    archive

  echo "✅ Archive tamamlandı!"
  echo ""
  echo "🚀 App Store Connect'e yükleniyor..."
  xcodebuild \
    -exportArchive \
    -archivePath "$HOME/nahaber/NaHaber.xcarchive" \
    -exportOptionsPlist "$HOME/nahaber/ExportOptions.plist" \
    -exportPath "$HOME/nahaber/ipa"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ✅ İşlem tamamlandı! IPA: ~/nahaber/ipa"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  echo "❌ Apple Distribution sertifikası hâlâ Keychain'de YOK!"
  echo ""
  echo "⚠️  Manuel kurulum gerekiyor:"
  echo "   1. Keychain Access uygulamasını açın"
  echo "   2. Dosya > Öğeleri İçe Aktar"
  echo "   3. ~/nahaber/ios_distribution.p12 seçin"
  echo "   4. Parola boş bırakın, Ekle'ye tıklayın"
  echo ""
  echo "   Veya: Xcode Settings > Accounts üzerinden"
  echo "   Apple Distribution sertifikası oluşturun."
  exit 1
fi
echo ""
