#!/bin/bash
cd "$(dirname "$0")"

echo "🔓 Eski lock dosyaları temizleniyor..."
rm -f .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock 2>/dev/null || true

echo "📋 Değişiklikler stage ediliyor..."
git add -A

echo "💬 Commit yapılıyor..."
git diff --cached --quiet && echo "ℹ️  Commit yok (staging boş)" || \
git commit -m "[deploy] fix: video shaking + play button stuck; add Kibris worker

- VideoFeedItem: e.source check — her handler sadece kendi iframe'inden mesaj alır
  (sanal penceredeki coklu YouTube iframe'leri birbirinin state'ini bozuyordu → shaking)
- VideoFeedItem: onLoad'da setPaused(false) — play butonu artik takilmiyor
- sources.ts: 8 yeni Kibris kaynagi (bugunkibris, detaykibris, sondakikacyprus,
  kibrisgercek, gundemkibris, haberkibris, sondakika-kibris, polis-kktc)
- config.ts: KIBRIS_SOURCE_IDS (17 kaynak toplamda) + EDITOR_REGISTRY kibris-haberleri
- kibrisWorker.ts + cron/newsroom/kibris/route.ts + vercel.json cron girisi"

echo ""
echo "📤 Push ediliyor → claude/nahabber-project-architecture-NZhLO"
git push origin claude/nahabber-project-architecture-NZhLO
echo ""
echo "✅ Tamamlandi! Vercel ~2 dk icinde deploy eder."
echo "   https://vercel.com/shenteam1/nahaber/deployments"
echo ""
read -p "Kapatmak icin Enter'a bas..."
