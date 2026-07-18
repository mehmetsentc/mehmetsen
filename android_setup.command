#!/bin/bash
# NaHaber — Android Platform Kurulumu
# Çalıştır: çift tıkla veya terminal'de: bash android_setup.command

set -e
cd "$(dirname "$0")"

echo "======================================"
echo "  NaHaber Android Platform Kurulumu"
echo "======================================"

# 1. @capacitor/android kur
echo ""
echo "[1/4] @capacitor/android kuruluyor..."
npm install @capacitor/android@^8.4.1

# 2. Android platformunu ekle
echo ""
echo "[2/4] Android platformu ekleniyor..."
npx cap add android

# 3. google-services.json kopyala
echo ""
echo "[3/4] google-services.json kopyalanıyor..."
if [ -f "google-services.json" ]; then
  cp google-services.json android/app/google-services.json
  echo "  ✓ google-services.json → android/app/google-services.json"
else
  echo "  ⚠️  google-services.json bulunamadı! Lütfen Downloads'tan kopyalayın:"
  echo "  cp ~/Downloads/google-services.json android/app/"
fi

# 4. Capacitor sync
echo ""
echo "[4/4] Capacitor sync çalıştırılıyor..."
npx cap sync android

echo ""
echo "======================================"
echo "  ✅ Android kurulumu tamamlandı!"
echo "======================================"
echo ""
echo "Sonraki adım: create_keystore.command çalıştır"
echo ""
