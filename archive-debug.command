#!/bin/bash
# NaHaber — Archive Debug (Log dosyasına yaz)
LOG="$HOME/nahaber/build.log"
PROJECT="$HOME/nahaber/ios/App/App.xcodeproj"
ARCHIVE="$HOME/nahaber/NaHaber.xcarchive"

echo "" | tee "$LOG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG"
echo "  NaHaber — Archive Debug" | tee -a "$LOG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG"
echo "" | tee -a "$LOG"

echo "📋 Xcode sürümü:" | tee -a "$LOG"
xcodebuild -version 2>&1 | tee -a "$LOG"
echo "" | tee -a "$LOG"

echo "📱 Mevcut SDK'lar:" | tee -a "$LOG"
xcodebuild -showsdks 2>&1 | tee -a "$LOG"
echo "" | tee -a "$LOG"

echo "🎯 Destinations:" | tee -a "$LOG"
xcodebuild -project "$PROJECT" -scheme App -showdestinations 2>&1 | tee -a "$LOG"
echo "" | tee -a "$LOG"

echo "📦 Archive başlıyor (tam log)..." | tee -a "$LOG"
xcodebuild \
  -project "$PROJECT" \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE" \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=VMZA353GB7 \
  archive 2>&1 | tee -a "$LOG"

EXIT_CODE=${PIPESTATUS[0]}
echo "" | tee -a "$LOG"
echo "Exit code: $EXIT_CODE" | tee -a "$LOG"

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Archive BAŞARILI!" | tee -a "$LOG"
else
  echo "❌ Archive BAŞARISIZ (exit $EXIT_CODE)" | tee -a "$LOG"
fi

echo "" | tee -a "$LOG"
echo "Log kaydedildi: $LOG" | tee -a "$LOG"
