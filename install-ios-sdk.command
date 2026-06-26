#!/bin/bash
# NaHaber — iOS 26.5 Platform SDK İndir
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  iOS 26.5 Platform SDK İndir"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📥 iOS SDK indiriliyor (bu işlem 3-8 dakika sürebilir)..."
echo "   Lütfen bekleyin..."
echo ""

# xcodebuild ile iOS platformunu indir
xcodebuild -downloadPlatform iOS

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ iOS 26.5 SDK kuruldu!"
echo "  Şimdi archive-upload.command çalıştırılıyor..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Ardından archive ve upload
PROJECT="$HOME/nahaber/ios/App/App.xcodeproj"
ARCHIVE="$HOME/nahaber/NaHaber.xcarchive"
EXPORT_DIR="$HOME/nahaber/ipa"
EXPORT_OPTIONS="$HOME/nahaber/ExportOptions.plist"

echo "📦 Archive alınıyor..."
xcodebuild \
  -project "$PROJECT" \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE" \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=VMZA353GB7 \
  archive

echo ""
echo "✅ Archive tamamlandı: $ARCHIVE"
echo ""

echo "🚀 App Store Connect'e yükleniyor..."
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -exportPath "$EXPORT_DIR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ TÜM İŞLEMLER TAMAMLANDI!"
echo "  IPA: $EXPORT_DIR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
