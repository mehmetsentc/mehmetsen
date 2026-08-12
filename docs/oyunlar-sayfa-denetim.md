# Oyunlar sayfası denetimi

**Tarih:** 13 Ağustos 2026  
**Kapsam:** `https://www.nahaber.com/oyunlar` + `https://canakkale.nahaber.com/oyunlar` · masaüstü (~1280) + mobil (390×844)  
**Yöntem:** kod incelemesi + canlı Playwright (sistem Chrome). cursor-ide-browser MCP bu oturumda sekme tutamadı.  
**Kanıt:** `docs/evidence/oyunlar-audit/`  
**Canvas:** sohbet yanında `oyunlar-sayfa-denetim.canvas.tsx`

## Rotalar

| Rota | Açıklama |
|------|----------|
| `/oyunlar` | Hub (`GamesHubClient`) |
| `/oyunlar/[slug]` | Native oyun + `GameAuthGate` |
| `/api/games/scores` | Skor API |
| `/games` | Yok (yalnızca `/oyunlar`) |

Şehir ağı (Çanakkale) aynı app route’unu paylaşıyor; ayrı games stack yok.

**Slug’lar:** `tavla`, `yilan`, `satranc`, `sudoku`, `tetris`, `kelime`, `adam-asmaca`, `hafiza`, `mayin`, `2048`  
Hepsi `provider: 'native'` — iframe yok.

## Canlı sonuçlar (misafir)

- Hub her iki hostta **HTTP 200**, **10 kart**, footer `/kategori/oyun-espor` ve `/iletisim` **200**.
- Yatay taşma gözlenmedi.
- Her oyun slug’ı → auth kapısı veya `~1.2s` sonra `/register?next=/oyunlar/...`.
- Gerçek tahta / oynanış misafirde doğrulanamadı.

## Öncelikli boşluklar

1. **Üyelik duvarı + otomatik redirect** — Gate metni okunmadan kayıt sayfasına atılıyor; “Üye ol / Giriş” CTA’ları pratikte zayıf.
2. **GameShell layout** — `100dvh` + `overflow-hidden` + `touchmove` engeli; kurallar / seviye / tahta / sıralama kısa telefonda kesilebilir, shell içinde scroll yok. `hideLeaderboard` hiçbir oyunda kullanılmıyor.
3. **“YENİ” rozeti** — 10/10 `featured: true`; rozet anlamsız.
4. **Dokunma hedefleri** — Kelime/Adam Asmaca `min-w-[1.7rem]`; tavla 12 sütun; Yılan/2048’de on-screen D-pad yok (Tetris’te var).
5. **Tasarım dili** — Mor/indigo hub + emoji thumbnail; marka kırmızısından kopuk.
6. **`xs:` breakpoint yok** — `hidden xs:inline` (“Geri dön / Yeniden”) hiç görünmüyor.
7. **Konsol** — OneSignal `api.onesignal.com` CSP dışı; mobilde React hydration #418; Çanakkale’de AdSense `connect-src` engeli.

## Olumlu

- Native oyunlar, skor/kurallar altyapısı, GameShell’in MobileNav’ı (z-110 > z-105) örtmesi.
- Hub linkleri sağlam; şehir + ulusal aynı katalog.
- `robots: noindex` bilinçli (ince sayfa riski).

## Öneri (sonraki tur, deploy yok)

1. Girişli hesapla 10 oyunda smoke (tahta, swipe, skor, sıralama).
2. Shell: içerik alanı scroll veya sıralamayı drawer; kısa ekran testi.
3. `featured` gerçekten yeni olanlara; hub CTA marka rengine.
4. Kelime/hangman tuş boyutları ≥44px; arcade için opsiyonel D-pad.
5. Auth: otomatik redirect’i kaldır veya ≥5s / kullanıcı tıklayana kadar bekle.

---

*Bu tur yalnızca denetim + rapor; büyük fix uygulanmadı.*
