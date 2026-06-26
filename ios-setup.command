#!/bin/bash
# NaHaber — Capacitor iOS Kurulum Scripti
# Bu dosyaya çift tıklayın — Terminal otomatik açılır ve kurulum başlar

set -e
cd "$HOME/nahaber"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NaHaber iOS Kurulum — Capacitor"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Capacitor paketlerini kur
echo "📦 Capacitor paketleri kuruluyor..."
npm install @capacitor/core @capacitor/cli @capacitor/ios

echo ""
echo "⚙️  Capacitor başlatılıyor..."
# init — eğer zaten varsa hata vermemesi için || true
npx cap init NaHaber com.nahaber.app --web-dir=out 2>/dev/null || echo "  (zaten başlatılmış, devam ediliyor)"

echo ""
echo "📱 iOS platformu ekleniyor..."
# Eğer ios/ klasörü yoksa ekle
if [ ! -d "ios" ]; then
  npx cap add ios
else
  echo "  (iOS platformu zaten mevcut)"
fi

echo ""
echo "🔄 Capacitor sync yapılıyor..."
npx cap sync ios

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Kurulum tamamlandı!"
echo "  Şimdi Xcode açılıyor..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Xcode'u aç
npx cap open ios
