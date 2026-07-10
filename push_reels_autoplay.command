#!/bin/bash
cd "$(dirname "$0")"

echo "📺 Reels autoplay fix push ediliyor..."
git add src/components/video/VideoFeedItem.tsx
git add src/hooks/useInfiniteScroll.ts
git commit -m "fix: YouTube reels — postMessage '*' ile iframe origin uyuşmazlığı giderildi

Sorun: YouTube iframe yüklenirken origin değişebiliyor (nocookie→youtube.com).
Hedefli postMessage (YT_EMBED_ORIGIN) sessizce düşüyor → 'listening' ulaşmıyor
→ onStateChange/infoDelivery hiç gelmiyor → siyah ekran (paused=true kalıyor).

Çözüm: postToYT'de target '*' kullanıldı.
Bonus: infoDelivery'de playerState 3 (buffering) gelince de paused=false yapıldı."

git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Push tamamlandı! Vercel deploy edecek (~1-2 dk)."
echo ""
read -p "Kapatmak için Enter'a bas..."
