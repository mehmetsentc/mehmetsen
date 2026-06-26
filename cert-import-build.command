#!/bin/bash
# NaHaber — Sertifika import (cert+key ayrı ayrı) ve Archive

KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
cd "$HOME/nahaber"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NaHaber — Cert+Key Import & Archive"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Mevcut sertifikaları temizle
echo "🧹 Eski dağıtım sertifikası siliniyor..."
security delete-certificate -c "Apple Distribution: Mehmet en (VMZA353GB7)" "$KEYCHAIN" 2>/dev/null && echo "  Silindi" || echo "  (yoktu)"

# Önce private key import et (codesign erişimi ver)
echo ""
echo "🔑 Private key import ediliyor..."
security import distribution.key \
  -A \
  -k "$KEYCHAIN" \
  -T /usr/bin/codesign \
  -T /usr/bin/security \
  2>&1 && echo "  ✅ Key import edildi" || echo "  ⚠️  Key import başarısız (belki zaten var)"

# Sonra sertifika import et (DER format - MAC yok, hata olmaz)
echo ""
echo "📜 Sertifika import ediliyor (DER format)..."
security import ios_distribution.cer \
  -A \
  -k "$KEYCHAIN" \
  -T /usr/bin/codesign \
  2>&1 && echo "  ✅ Cert import edildi" || echo "  ⚠️  Cert import başarısız (belki zaten var)"

# Keychain partition list güncelle (macOS 10.12+)
echo ""
echo "🔓 Keychain erişim izni güncelleniyor..."
security set-key-partition-list \
  -S apple-tool:,apple: \
  -k "" \
  "$KEYCHAIN" 2>/dev/null && echo "  ✅ İzinler güncellendi" || echo "  ⚠️  İzin güncelleme başarısız (normal olabilir)"

# Kontrol
echo ""
echo "📋 Codesigning kimlikleri:"
security find-identity -v -p codesigning

echo ""
echo "📋 Tüm Apple sertifikaları:"
security find-identity -v | grep -i "apple" || echo "  (yok)"

# Archive
if security find-identity -v -p codesigning | grep -q "Apple Distribution"; then
  echo ""
  echo "✅ Apple Distribution sertifikası Keychain'de hazır!"
  echo ""
  echo "📦 Archive alınıyor... (5-10 dakika sürebilir)"

  xcodebuild \
    -project "$HOME/nahaber/ios/App/App.xcodeproj" \
    -scheme App \
    -configuration Release \
    -destination "generic/platform=iOS" \
    -archivePath "$HOME/nahaber/NaHaber.xcarchive" \
    CODE_SIGN_STYLE=Automatic \
    DEVELOPMENT_TEAM=VMZA353GB7 \
    -allowProvisioningUpdates \
    archive 2>&1 | tee "$HOME/nahaber/archive.log" | tail -20

  if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Archive tamamlandı!"
    echo ""
    echo "🚀 App Store Connect'e yükleniyor..."
    xcodebuild \
      -exportArchive \
      -archivePath "$HOME/nahaber/NaHaber.xcarchive" \
      -exportOptionsPlist "$HOME/nahaber/ExportOptions.plist" \
      -exportPath "$HOME/nahaber/ipa" \
      -allowProvisioningUpdates 2>&1 | tee -a "$HOME/nahaber/archive.log" | tail -20

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ✅ İşlem tamamlandı! IPA: ~/nahaber/ipa"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  else
    echo "❌ Archive başarısız! Log: ~/nahaber/archive.log"
    exit 1
  fi
else
  echo ""
  echo "❌ Apple Distribution sertifikası hâlâ Keychain'de YOK!"
  echo ""
  echo "⚠️  Lütfen şunları deneyin:"
  echo "   Xcode → Settings → Accounts → Apple ID seçin"
  echo "   → Manage Certificates → + → Apple Distribution"
  exit 1
fi
