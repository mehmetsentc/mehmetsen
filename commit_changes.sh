#!/bin/bash
cd ~/nahaber
rm -f .git/index.lock .git/HEAD.lock .git/refs/heads/*.lock

git add \
  src/components/admin/EditMediaSection.tsx \
  src/app/admin/news/page.tsx \
  src/lib/postUtils.ts \
  src/components/post/PostDetail.tsx \
  src/components/feed/FeedMediaCard.tsx \
  src/components/feed/FeedMediaPreview.tsx \
  src/components/video/VideoFeedItem.tsx \
  src/store/reelsAudioContext.tsx

git commit -m "fix(reels): YouTube autoplay — sabit iframe + postMessage play/pause

Sorun: isActive değiştiğinde iframe key değişiyor, YouTube sıfırdan
yükleniyor (2-3s gecikme). iOS'ta autoplay=1 URL param engelleniyor.

Çözüm:
- VideoFeedItem: iframe key sabit (yt-{id}) — kaydırmada remount YOK
- VideoFeedItem: tek embedSrc (autoplay URL param kaldırıldı)
- VideoFeedItem: postMessage playVideo/pauseVideo ile play kontrolü
  · isActive=true  → playVideo + mute/unMute
  · isActive=false → pauseVideo
  · onReady event → playVideo (player hazır olduğunda hemen başlat)
  · Retry: 600ms/1500ms/3000ms (player henüz hazır değilse)
- reelsAudioContext: varsayılan muted=true (ilk ziyarette sessiz)
  · Tarayıcı autoplay politikası: sessiz video her zaman oynar
  · Kullanıcı daha önce sesi açmışsa (localStorage='0') tercih korunur"

git push
echo "✅ Tamamlandı!"
