#!/bin/bash
set -e
cd "$(dirname "$0")"

# Stale lock dosyasını temizle
if [ -f ".git/index.lock" ]; then
  rm -f ".git/index.lock"
  echo "✓ index.lock temizlendi"
fi

# Sadece tema değişikliklerini commit et
git add \
  src/components/home/desktop/DesktopHomeFooter.tsx \
  src/components/home/desktop/DesktopMarketTicker.tsx \
  src/components/home/desktop/DesktopOpinionStrip.tsx \
  src/components/home/desktop/DesktopStoryBlocks.tsx \
  src/components/home/desktop/DesktopThemeToggle.tsx \
  src/components/home/desktop/DesktopWebHeader.tsx \
  src/components/home/desktop/NewspaperMasthead.tsx \
  src/constants/siteLegalLinks.ts \
  tailwind.config.ts

git commit -m "feat(desktop): NYT tema Faza 1+2

- Okuma süresi rozeti (X dk okuma) — tüm story bloklarda
- Haber rozet sistemi: Son Dakika / Özel Haber / Soruşturma / Analiz
- Borsa/döviz ticker şeridi masthead altında (USD, EUR, BIST100, Altın, BTC)
- font-serif → Source Serif 4 Tailwind mapping (hero başlıklarda aktif)
- Opinion strip: yazar avatarı + isim + Köşe Yazısı etiketi
- Light/Dark mode toggle DesktopWebHeader'a eklendi
- Footer: Kurumsal sütunu + 6→7 sütun, RSS linkleri, daha fazla kategori
- DesktopMarketTicker + DesktopThemeToggle yeni bileşenler"

git push
echo ""
echo "✅ Tema değişiklikleri push edildi — Vercel deploy başlıyor."
