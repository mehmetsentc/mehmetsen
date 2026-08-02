#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NaHaber v1.2 Build 13 — SIWA plugin registration fix"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Kök neden (Guideline 2.1a — Build 12 reddi):"
echo "  NativeAppleSignInPlugin derleniyordu ama Capacitor bridge'e"
echo "  kayıt edilmiyordu (CAPBridgedPlugin yok + packageClassList boş)."
echo "  JS → UNAVAILABLE → reviewer hata toast'u gördü."
echo ""
echo "Düzeltme:"
echo "  • CAPBridgedPlugin + AppViewController.registerPluginInstance"
echo "  • Doğrudan ASAuthorizationController (overlay VC kaldırıldı)"
echo "  • iPadOS 1004/1005 için 1 otomatik retry"
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

# ── Next.js build (web hata mesajları da canlıya gidecek) ─────────────────────
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
echo "🏗️  Xcode archive (Build 13)..."
xcodebuild archive \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "NaHaber.xcarchive" \
  MARKETING_VERSION=1.2 \
  CURRENT_PROJECT_VERSION=13 \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  PROVISIONING_PROFILE_SPECIFIER="NaHaber AppStore 2026" \
  DEVELOPMENT_TEAM=VMZA353GB7 \
  2>&1 | tee /tmp/nahaber-archive-13.log | grep -E "(error:|ARCHIVE SUCCEEDED|BUILD SUCCEEDED|FAILED|warning:.*AppViewController|warning:.*NativeApple)" | tail -40

if ! grep -q "ARCHIVE SUCCEEDED" /tmp/nahaber-archive-13.log; then
  echo "❌ Archive başarısız — /tmp/nahaber-archive-13.log"
  exit 1
fi

echo ""
echo "📦 IPA export ediliyor..."
xcodebuild -exportArchive \
  -archivePath "NaHaber.xcarchive" \
  -exportPath "ipa/" \
  -exportOptionsPlist "ExportOptions.plist" \
  -allowProvisioningUpdates \
  2>&1 | tail -12

echo ""
echo "🚀 App Store Connect'e yükleniyor..."
xcrun altool --upload-app \
  -f "ipa/App.ipa" \
  -t ios \
  --apiKey 88PX7Q6W29 \
  --apiIssuer 0b4b2878-8080-476e-aafe-0bd515dce30c \
  2>&1 | tail -20

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Build 13 yüklendi!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Sonraki adımlar:"
echo "  1. Web hata mesajları deploy oldu mu? (appleAuthErrors) — Vercel prod"
echo "  2. appstoreconnect.apple.com → Reply (docs/app-store-review-reply-siwa.md)"
echo "  3. Build 13 işlenince Submit for Review"
echo "  4. İdeal: iPad'de TestFlight ile Apple Sign-In'i bir kez doğrula"
echo ""
read -p "Kapatmak için Enter'a bas..."
