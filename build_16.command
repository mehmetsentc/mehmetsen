#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NaHaber v1.2 Build 16 — Apple Sign-In Profile tab fix"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Düzeltilen sorun (Guideline 2.1a — Build 15 reddi):"
echo "  • Apple ile kayıt sonrası Profile tab'a tıklayınca"
echo "    'Kullanıcı bulunamadı' hatası çıkıyordu."
echo "  • Race condition: onAuthStateChanged, Firestore yazılmadan"
echo "    önce profil okuyordu → yanlış username → yanlış URL."
echo "  • Fix: loginWithApple() sonrası refreshUser() çağrısı eklendi."
echo ""

# ── API key ────────────────────────────────────────────────────────────────────
echo "🔑 API key konumlandırılıyor..."
mkdir -p ~/.appstoreconnect/private_keys
if [ -f "AuthKey_88PX7Q6W29.p8" ]; then
  cp -f "AuthKey_88PX7Q6W29.p8" ~/.appstoreconnect/private_keys/AuthKey_88PX7Q6W29.p8
  echo "   ✅ API key hazır"
else
  echo "   ⚠️  AuthKey_88PX7Q6W29.p8 bulunamadı — upload başarısız olabilir"
fi
echo ""

# ── Next.js build ──────────────────────────────────────────────────────────────
echo "📦 Next.js build..."
npm run build 2>&1 | tail -12

echo ""
echo "📱 Capacitor sync (iOS)..."
npx cap sync ios 2>&1 | tail -8

# cap sync packageClassList'i npm plugin'leriyle yeniden yazar — yerel plugin'leri geri ekle
python3 - <<'PY'
import json
from pathlib import Path
p = Path("ios/App/App/capacitor.config.json")
cfg = json.loads(p.read_text())
needed = ["NativeAppleSignInPlugin", "NativeGeolocationPlugin"]
lst = list(cfg.get("packageClassList") or [])
for name in needed:
    if name not in lst:
        lst.append(name)
cfg["packageClassList"] = lst
p.write_text(json.dumps(cfg, indent="\t") + "\n")
print("   ✅ packageClassList:", lst)
PY

# Storyboard'un AppViewController kullandığını doğrula
if ! grep -q 'customClass="AppViewController"' ios/App/App/Base.lproj/Main.storyboard; then
  echo "❌ Main.storyboard AppViewController kullanmıyor — durduruldu"
  exit 1
fi
echo "   ✅ Main.storyboard → AppViewController"

echo ""
echo "🗑️  Eski archive temizleniyor..."
rm -rf NaHaber.xcarchive ipa/

echo ""
echo "🏗️  Xcode archive (Build 16)..."
xcodebuild archive \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "NaHaber.xcarchive" \
  MARKETING_VERSION=1.2 \
  CURRENT_PROJECT_VERSION=16 \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  PROVISIONING_PROFILE_SPECIFIER="NaHaber AppStore 2026" \
  DEVELOPMENT_TEAM=VMZA353GB7 \
  2>&1 | tee /tmp/nahaber-archive-16.log | grep -E "(error:|ARCHIVE SUCCEEDED|BUILD SUCCEEDED|FAILED|warning:.*AppViewController|warning:.*NativeApple)" | tail -40

if ! grep -q "ARCHIVE SUCCEEDED" /tmp/nahaber-archive-16.log; then
  echo "❌ Archive başarısız — /tmp/nahaber-archive-16.log"
  echo "──── Errors ────"
  grep -E "error:|ARCHIVE FAILED|BUILD FAILED|\*\* ARCHIVE" /tmp/nahaber-archive-16.log | tail -50 || true
  echo "──── Tail ────"
  tail -80 /tmp/nahaber-archive-16.log
  exit 1
fi

echo ""
echo "📦 IPA export ediliyor..."
xcodebuild -exportArchive \
  -archivePath "NaHaber.xcarchive" \
  -exportPath "ipa/" \
  -exportOptionsPlist "ExportOptions.plist" \
  -allowProvisioningUpdates \
  2>&1 | tee /tmp/nahaber-export-16.log | tail -20

if [ ! -f "ipa/App.ipa" ]; then
  echo "❌ IPA bulunamadı — export başarısız"
  tail -40 /tmp/nahaber-export-16.log
  exit 1
fi

# CFBundleVersion doğrula
echo ""
echo "🔍 IPA CFBundleVersion doğrulanıyor..."
TMPDIR_IPA=$(mktemp -d)
unzip -q -o "ipa/App.ipa" -d "$TMPDIR_IPA"
APP_DIR=$(find "$TMPDIR_IPA/Payload" -name "*.app" -type d | head -1)
INFO_PLIST="$APP_DIR/Info.plist"
BUNDLE_ID=$(/usr/bin/plutil -extract CFBundleIdentifier raw "$INFO_PLIST")
BUNDLE_VERSION=$(/usr/bin/plutil -extract CFBundleVersion raw "$INFO_PLIST")
SHORT_VERSION=$(/usr/bin/plutil -extract CFBundleShortVersionString raw "$INFO_PLIST")
echo "   CFBundleIdentifier: $BUNDLE_ID"
echo "   CFBundleShortVersionString: $SHORT_VERSION"
echo "   CFBundleVersion: $BUNDLE_VERSION"
rm -rf "$TMPDIR_IPA"

if [ "$BUNDLE_ID" != "com.nahaber.app" ]; then
  echo "❌ Yanlış bundle id: $BUNDLE_ID"
  exit 1
fi
if [ "$BUNDLE_VERSION" != "16" ]; then
  echo "❌ CFBundleVersion $BUNDLE_VERSION — beklenen 16. Upload iptal."
  exit 1
fi
echo "   ✅ Build 16 / com.nahaber.app doğrulandı"

echo ""
echo "🚀 App Store Connect'e yükleniyor..."
set +e
UPLOAD_OUT=$(xcrun altool --upload-app \
  -f "ipa/App.ipa" \
  -t ios \
  --apiKey 88PX7Q6W29 \
  --apiIssuer 0b4b2878-8080-476e-aafe-0bd515dce30c \
  2>&1)
UPLOAD_RC=$?
set -e
echo "$UPLOAD_OUT" | tee /tmp/nahaber-upload-16.log | tail -40

if [ $UPLOAD_RC -ne 0 ]; then
  echo ""
  echo "❌ Upload FAILED (exit $UPLOAD_RC)"
  exit $UPLOAD_RC
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Build 16 yüklendi!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Sonraki adımlar:"
echo "  1. appstoreconnect.apple.com → Build 16 işlenmesini bekle (~10 dk)"
echo "  2. iOS App 1.2 sayfasında build'i seç → Submit for Review"
echo ""
