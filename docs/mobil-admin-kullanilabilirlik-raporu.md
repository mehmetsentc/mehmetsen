# Mobil Admin Kullanılabilirlik Raporu

**Hedef:** `https://www.nahaber.com/admin` · viewport ~390×844 (iPhone 14 class)  
**Tarih:** 12 Ağustos 2026  
**Metod:** Canlı site giriş duvarına takıldı (login redirect); kod denetimi + P0 commit `18d8d73` sonrası durum analizi  
**Kapsam:** Ana Sayfa, Onaylar, İçerik, Menü, Cron; `MobileContent`, `MobileApprovals`, `MobileApprovalReview`, `MobileAdminBottomNav`, `MobileAdminHeader`, `AdminNewsEditor`, bottom sheet’ler

---

## Özet

Mobil admin iskeleti (alt navigasyon, onay kuyruğu, hideChrome editör modu) sağlam; P0 commit ile içerik listesine kategori / onay / paylaşım aksiyonları eklenmiş. Buna rağmen **390px genişlikte gezinirken ekran taşması ve yoğunluk** hâlâ belirgin: haber kartlarında çoklu aksiyon satırı kartları şişiriyor, overflow menüsü `overflow-hidden` kapsayıcıda kesiliyor, Cron ve birçok menü sayfası masaüstü düzeninde kalıyor. Kullanıcı “hareket halinde” (tek elle kaydırırken) yanlış dokunuş ve yatay kaydırma riskiyle karşılaşıyor.

| Öncelik | Bulgu | Odak |
|---------|------:|------|
| P0 | 5 | Taşma, kesilen UI, mobilde kullanılamayan kritik sayfalar |
| P1 | 7 | Editör yoğunluğu, gizli aksiyonlar, klavye/safe-area |
| P2 | 5 | Tipografi, toast çakışması, mikro hedefler |

---

## P0 — Kritik (gezinme / taşma)

| # | Alan | Sorun | Etki | Kanıt (kod) |
|---|------|-------|------|-------------|
| 1 | **MobileContent** | Her kartta `flex-wrap` ile 3–5 aksiyon butonu (Kategori, Onayla, Reddet, Hikâye, Post) | Kart yüksekliği ~120–180px; kaydırırken yanlış dokunuş, liste “ağırlaşıyor” | `MobileContent.tsx` L316–382 |
| 2 | **MobileContent** | İşlemler açılır menüsü `overflow-hidden` liste kapsayıcısı içinde `absolute` konumlu | “Düzenle / Sil” menüsü altta kesilebilir; son kartlarda menü görünmez | `MobileContent.tsx` L264, L384–423 |
| 3 | **/admin/cron** | Mobil varyant yok; `CMSHeader` + `p-6` + çok sütunlu grid + uzun aksiyon şeridi | Menüden Cron’a girince yatay taşma, küçük butonlar, operasyonel izleme mobilde pratik değil | `cron/page.tsx` L401–455, L615+ |
| 4 | **AdminNewsEditor** | Slug satırı: sabit `nahaber.com/haber/` + input, `min-w-0` eksik | 390px’te yatay taşma veya input sıkışması | `AdminNewsEditor.tsx` L761–770 |
| 5 | **Menü → masaüstü sayfalar** | `MobileMenu` Cron, SEO, Analitik, Sosyal vb. link veriyor; çoğunun mobil düzeni yok | Alt nav “Menü”den girilen sayfalar taşar veya okunaksız kalır | `MobileMenu.tsx` L27–66 |

---

## P1 — Yüksek

| # | Alan | Sorun | Öneri |
|---|------|-------|-------|
| 1 | **AdminNewsEditor** | ~1500 satır tek form; mobilde accordion/step yok | Bölümlü wizard veya collapsible section |
| 2 | **MobileApprovalReview** | “Reddet” yalnızca `⋯` menüsünde; birincil CTA satırında yok | Sticky bar: Onayla + Reddet; Düzenle ikincil |
| 3 | **Sheet / bottom nav** | Sheet’ler `z-[60–70]`, nav `z-40`; overlay nav’ı kapatıyor ama kısmi sheet’lerde safe-area dışında kalabilir | Tek `MobileAdminSheetHost`; `padding-bottom: nav + safe-area` |
| 4 | **Klavye** | Arama sheet ve editör input’larında `visualViewport` / `dvh` yok | iOS’ta klavye alt CTA’ları örter |
| 5 | **MobileAdminHeader** | Profil avatarı `h-9 w-9` (36px) | Min 44×44px dokunma alanı |
| 6 | **Filtre chip’leri** | `hide-scrollbar` ile yatay kaydırma gizli | Fade ipucu veya “Tümü” yanında kaydırma göstergesi |
| 7 | **/admin/social** | Mobil shell yok; geniş tablo/kart düzeni | Özet mobil dashboard veya “masaüstünde aç” callout |

---

## P2 — Orta

| # | Alan | Sorun |
|---|------|-------|
| 1 | Toast | `fixed top-16` — sticky header ile çakışabilir |
| 2 | Metadata | `text-[10px]` / `text-[11px]` rozet ve meta satırları okunması zor |
| 3 | Alt nav FAB | Merkez `+` `-mt-5` ile içerik altına taşar; son liste öğesi FAB altında kalabilir |
| 4 | Paylaşım sheet | Checkbox `h-4 w-4` — dokunma hedefi küçük |
| 5 | Çift padding | `layout.tsx` `pb-[3.75rem+safe-area]` + bazı sayfalarda ek `pb-28` — tutarlı ama fazla boşluk |

---

## İyi çalışanlar (korunmalı)

| Alan | Neden iyi |
|------|-----------|
| **MobileAdminBottomNav** | 5 sekme, badge, merkez oluştur; `min-h-12` sekmeler |
| **hideChrome** | Edit / onay inceleme / quick compose’da üst+alt chrome kalkıyor | `MobileAdminContext.tsx` L23–28 |
| **MobileApprovals** | Büyük kartlar, tek dokunuşla inceleme; chip filtreleri yatay scroll ile kontrollü |
| **MobileApprovalReview** | Sabit alt CTA (Onayla + Düzenle), safe-area, rapid mode sayacı |
| **P0 commit (`18d8d73`)** | Kategori sheet, sosyal paylaşım sheet, listede onay/red — önceki “masaüstüne kilitli” boşluk kapanmış |
| **MobileSearchSheet** | Tam ekran arama; safe-area üst padding |
| **MobileCategorySheet** | `max-h-[75vh]` + iç scroll; yerel alt kategori adımı |

---

## Önerilen yeniden tasarım

### 1. Kart aksiyonları → bottom sheet (tek giriş noktası)

**Şu an:** Her haber kartında 3–5 inline buton + sağ üst `⋯`.  
**Hedef:**

```
[Kart: başlık + meta + thumbnail]
[ Tek satır: Birincil aksiyon | ⋯ Daha fazla ]
```

- Birincil: duruma göre **Onayla** veya **Düzenle**
- `⋯` → bottom sheet: Kategori, Hikâye, Post, Reddet, Sil, Önizle
- Swipe-to-action (opsiyonel P2): sağa Onayla, sola Reddet — sadece onay bekleyenlerde

### 2. Sticky CTA katmanı (onay + editör)

| Ekran | Sticky üst | Sticky alt |
|-------|------------|------------|
| Onay inceleme | Geri + ilerleme | **Reddet** (outline) · **Onayla** (primary) |
| Tam editör | Başlık + kaydet durumu | **Kaydet** full-width |
| Hızlı compose | Kapat | **Onaya gönder** / **Taslak** |

`padding-bottom` = `env(safe-area-inset-bottom) + 0` (hideChrome) veya `+ 3.75rem` (nav görünürken sheet değil).

### 3. Cron mobil — “operasyon özeti”

Tam masaüstü grid yerine:

- Üst: kuyruk sayısı + son hata (tek kart)
- Orta: son 5 cron koşusu (dikey liste)
- Alt: en sık 3 job için büyük tetikle butonu
- Detay tablo → yatay scroll yerine kart listesi

### 4. Taşma önleme checklist

- Liste kapsayıcılarında `overflow-hidden` + iç `absolute` menü **kaldır** → portal veya sheet
- Tüm `flex` satırlarında metin taşıyıcılarına `min-w-0` + `truncate`
- `100vw` kullanımından kaçın; admin shell zaten `overflow-hidden`
- Chip şeritleri: `-mx-4 px-4` + sağda gradient fade

### 5. Klavye / safe-area

- Input odaklandığında sheet’i `visualViewport.height` ile yeniden konumlandır
- iOS için `interactive-widget=resizes-content` meta (uygulama geneli)

---

## Öncelik yol haritası

| Sprint | İş | Öncelik | Tahmini etki |
|--------|-----|---------|--------------|
| **S1** | MobileContent: inline aksiyonları sheet’e taşı, menüyü portal/sheet yap | P0 | Kaydırma güvenliği, taşma fix |
| **S1** | AdminNewsEditor slug satırı + yatay taşma düzeltmeleri | P0 | Editörde yatay scroll kalkar |
| **S2** | MobileApprovalReview: Reddet’i sticky bar’a al | P1 | Onay hızı artar |
| **S2** | Cron mobil özet sayfası veya “mobilde sınırlı” banner | P0 | Menü dead-end kalkar |
| **S3** | AdminNewsEditor accordion (Temel / Medya / SEO / AI) | P1 | Editör kullanılabilirliği |
| **S3** | Sheet host + klavye/safe-area birleşik katman | P1 | iOS regresyonları |
| **S4** | Sosyal admin mobil özet | P1 | Dağıtım ekibi mobil erişim |
| **Backlog** | Swipe actions, chip fade, toast konumu | P2 | Cila |

---

## Metodoloji notu

Canlı `nahaber.com/admin` oturum gerektirdiği için görsel doğrulama yapılamadı. Bulgular `claude/nahabber-project-architecture-NZhLO` branch kod tabanına dayanır; P0 commit sonrası önceki UX raporundaki “aksiyon yok” maddeleri güncellenmiştir.

**İlgili dosyalar:**

- Canvas: [`mobil-admin-kullanilabilirlik.canvas.tsx`](/Users/user/.cursor/projects/Users-user-nahaber-canakkale-nahaber/canvases/mobil-admin-kullanilabilirlik.canvas.tsx)
- Önceki rapor (kısmen güncelliğini yitirmiş): `docs/mobil-admin-ux-raporu.md`

---

## 13 Ağustos 2026 — Canlı mobil tarama + lokal düzeltmeler

**Viewport:** 390×844 (iPhone sınıfı), Chrome headless + UA emülasyonu  
**Canlı URL:** `https://www.nahaber.com/admin` → çerez sheet → **`/login` duvarı** (oturum yok; kimlik uydurulmadı)

### Görülenler
1. Çerez bottom sheet büyük CTA’larla mobil-uyumlu.
2. Admin korumalı; giriş sonrası panel bu koşuda açılamadı.
3. Kod + önceki S1 (`ea11dab` / `18d8d73`): onay incelemede sticky Reddet/Düzenle/Onayla, içerik sheet aksiyonları mevcut.

### Bu turda lokal fix (deploy yok)
| Fix | Dosya |
|-----|-------|
| Nested menü sayfalarında Instagram-benzeri **← geri + başlık** (CMSHeader mobilde gizliydi) | `MobileAdminHeader.tsx` |
| Editör geri: **X → ArrowLeft**; onaydan gelen dönüş `?from=approvals` | `AdminNewsEditor.tsx`, `MobileApprovalReview.tsx`, edit page Suspense |
| Slug satırı 390px taşma (`min-w-0`, kısa `/haber/` prefix) | `AdminNewsEditor.tsx` |
| Onay kuyruğu: Hızlı Onay + filtre chip **min-h-11** | `MobileApprovals.tsx` |

**Deploy:** yalnızca lokal commit; `[deploy]` yok — canlıya kullanıcı onayıyla.
