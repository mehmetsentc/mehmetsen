#!/bin/bash
# NaHaber — Android Release AAB Build
# Google Play'e yüklenecek .aab dosyasını üretir

set -e
cd "$(dirname "$0")"

echo "======================================"
echo "  NaHaber Android Release Build"
echo "======================================"

# Ön koşul kontrolleri
if [ ! -d "android" ]; then
  echo "❌ android/ klasörü bulunamadı. Önce android_setup.command çalıştırın."
  exit 1
fi

if [ ! -f "android/app/nahaber-release.keystore" ]; then
  echo "❌ Keystore bulunamadı. Önce create_keystore.command çalıştırın."
  exit 1
fi

# build.gradle'a signing config ekle (henüz eklenmemişse)
GRADLE_FILE="android/app/build.gradle"

if ! grep -q "nahaber-release.keystore" "$GRADLE_FILE"; then
  echo ""
  echo "[1/4] build.gradle'a signing config ekleniyor..."

  # signingConfigs bloğunu bul ve ekle
  python3 - << 'PYEOF'
import re

with open("android/app/build.gradle", "r") as f:
    content = f.read()

# keystore.properties okuma kodu
props_code = '''
    // Keystore
    def keystorePropertiesFile = rootProject.file("keystore.properties")
    def keystoreProperties = new Properties()
    if (keystorePropertiesFile.exists()) {
        keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
    }

'''

# signingConfigs ekle
signing_config = '''
    signingConfigs {
        release {
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
        }
    }
'''

# buildTypes içindeki release'e signingConfig ekle
if "signingConfig signingConfigs.release" not in content:
    content = content.replace(
        "release {",
        "release {\n            signingConfig signingConfigs.release",
        1
    )

# signingConfigs bloğunu android { içine ekle (henüz yoksa)
if "signingConfigs {" not in content:
    content = content.replace("android {", "android {" + signing_config, 1)

# properties okuma kodunu ekle (android { öncesine)
if "keystorePropertiesFile" not in content:
    content = content.replace("android {", props_code + "android {", 1)

with open("android/app/build.gradle", "w") as f:
    f.write(content)

print("  ✓ build.gradle güncellendi")
PYEOF
fi

# Capacitor sync
echo ""
echo "[2/4] Capacitor sync..."
npx cap sync android

# Release AAB build
echo ""
echo "[3/4] AAB build ediliyor (bu birkaç dakika sürebilir)..."
cd android
./gradlew bundleRelease
cd ..

# AAB dosyasını kopyala
AAB_SOURCE="android/app/build/outputs/bundle/release/app-release.aab"
AAB_DEST="NaHaber-release.aab"

echo ""
echo "[4/4] AAB kopyalanıyor..."
if [ -f "$AAB_SOURCE" ]; then
  cp "$AAB_SOURCE" "$AAB_DEST"
  echo ""
  echo "======================================"
  echo "  ✅ Build tamamlandı!"
  echo "======================================"
  echo ""
  echo "  📦 $AAB_DEST"
  echo "  $(du -sh "$AAB_DEST" | cut -f1) boyutunda"
  echo ""
  echo "Sonraki adım: Google Play Console'a bu .aab dosyasını yükleyin"
  echo ""
else
  echo "❌ AAB bulunamadı: $AAB_SOURCE"
  echo "Gradle loglarını kontrol edin."
  exit 1
fi
