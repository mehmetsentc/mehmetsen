#!/bin/bash
cd "$(dirname "$0")"

echo "🔓 Eski lock dosyaları temizleniyor..."
rm -f .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock 2>/dev/null || true

echo "📋 Değişiklikler stage ediliyor..."
git add -A

echo "💬 Commit yapılıyor..."
git diff --cached --quiet && echo "ℹ️  Commit yok (staging boş)" || \
git commit -m "[deploy] fix(build9): Apple Sign In + geolocation + localStorage key fix

App Store Rejection 2.1(a) — Kök nedeni ve düzeltmeleri (Build 9):

[APPLE SIGN IN - KÖK NEDEN ÇÖZÜLDÜ]
- Firebase projesinde iOS uygulaması kayıtlıydı: Firebase sadece
  'com.nahaber.service' (web Service ID) kabul ediyordu, ancak native iOS
  Apple Sign In JWT'leri 'aud: com.nahaber.app' (Bundle ID) içeriyor.
  → Firebase Console'da iOS uygulaması (com.nahaber.app) kaydedildi.

[KONUM İZNİ - KRİTİK LOCALSTORAGE HATASI DÜZELTİLDİ]
- ESKİ HATA: markPrompted() 'Devam' butonuna basılır basılmaz çağrılıyordu
  (iOS dialog açılmadan önce). Sonuç: localStorage'da 'nahaber-location-prompted'='1'
  kalıyordu → uygulamayı bir daha açınca dialog hiç çıkmıyordu.
  Apple reviewer cihazlarında bu key set edilmiş durumda.
- YENİ DÜZELTME: localStorage key 'nahaber-location-prompted-v2' oldu.
  Eski key artık engel değil → reviewer cihazlarında da dialog çıkacak.
- NativeGeolocationPlugin.swift: CLLocationManager.requestWhenInUseAuthorization()
  garantili native dialog (WKWebView bypass)
- NativeGeolocation.ts: Capacitor plugin wrapper
- project.pbxproj: NativeGeolocationPlugin.swift Xcode'a eklendi

[VİDEO - Shaking / Play butonu takılması]
- VideoFeedItem.tsx: e.source check + onLoad setPaused(false)

[KIBRIS WORKER]
- sources.ts + config.ts + kibrisWorker.ts + cron route + vercel.json"

echo ""
echo "📤 Push ediliyor → claude/nahabber-project-architecture-NZhLO"
git push origin claude/nahabber-project-architecture-NZhLO
echo ""
echo "✅ Tamamlandı! Vercel ~2 dk içinde deploy eder."
echo "   https://vercel.com/shenteam1/nahaber/deployments"
echo ""
read -p "Kapatmak için Enter'a bas..."
