#!/bin/bash
cd /Users/user/nahaber/ios/App

echo "=== Xcode Archive Başlıyor ==="
echo "Tarih: $(date)"

PROFILE_SRC="/Users/user/nahaber/NaHaber_AppStore_2026.mobileprovision"
PROFILE_UUID="2e4d40b4-a18f-4a91-8b90-7004ab7ab8b6"
PROFILE_CERT="/Users/user/Downloads/cert_work/profile_cert.der"
KEY_FILE="/Users/user/Downloads/cert_work/distribution_private.key"
PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
BUILD_KEYCHAIN="/tmp/nahaber_build.keychain-db"
BUILD_KP="NaHaber_Build_2026"

# Profile'ı sisteme yükle
mkdir -p "$PROFILE_DIR"
cp "$PROFILE_SRC" "$PROFILE_DIR/$PROFILE_UUID.mobileprovision"
echo "Profile yüklendi: $PROFILE_UUID"

# Eski build keychain'i temizle
security delete-keychain "$BUILD_KEYCHAIN" 2>/dev/null || true

# Bilinen parolayla yeni bir build keychain oluştur
echo "Build keychain oluşturuluyor..."
security create-keychain -p "$BUILD_KP" "$BUILD_KEYCHAIN"
security set-keychain-settings -lut 21600 "$BUILD_KEYCHAIN"
security unlock-keychain -p "$BUILD_KP" "$BUILD_KEYCHAIN"

# Sertifika ve private key'i build keychain'e yükle
echo "Sertifika build keychain'e yükleniyor..."
security import "$PROFILE_CERT" -k "$BUILD_KEYCHAIN" -T /usr/bin/codesign -T /usr/bin/security -A 2>&1

echo "Private key build keychain'e yükleniyor..."
security import "$KEY_FILE" -k "$BUILD_KEYCHAIN" -T /usr/bin/codesign -T /usr/bin/security -A 2>&1

# Partition list ayarla — codesign'a dialog olmadan erişim izni ver
echo "Codesign erişim izni veriliyor..."
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$BUILD_KP" "$BUILD_KEYCHAIN"

# Build keychain'i search listesine ekle (login keychain'den önce)
security list-keychains -d user -s "$BUILD_KEYCHAIN" ~/Library/Keychains/login.keychain-db

echo "Mevcut identities:"
security find-identity -v -p codesigning | grep "Apple Distribution" || true

xcodebuild archive \
  -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -archivePath /Users/user/Downloads/NaHaber_1.1.xcarchive \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="33E037D9850E41DFFBD38D1014369C9847FE9A50" \
  PROVISIONING_PROFILE="$PROFILE_UUID" \
  DEVELOPMENT_TEAM="VMZA353GB7" \
  OTHER_CODE_SIGN_FLAGS="--keychain $BUILD_KEYCHAIN" \
  | tee /Users/user/Downloads/xcodebuild_archive.log

echo ""
echo "=== Tamamlandı ==="
echo "Archive: /Users/user/Downloads/NaHaber_1.1.xcarchive"

# Search listesini eski haline döndür
security list-keychains -d user -s ~/Library/Keychains/login.keychain-db
