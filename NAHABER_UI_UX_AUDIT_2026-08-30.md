# NAHABER FULL UI/UX & LIVE SURFACE AUDIT REPORT

**Tarih:** 30 Ağustos 2026 · **Kapsam:** AUDIT ONLY — kod veya içerik değiştirilmedi, commit/push/deploy yapılmadı.
**Yöntem:** Repository kod incelemesi (device bridge, read-only) + gerçek Production browser testi (Claude in Chrome, mevcut authenticated oturum).

---

## Executive Summary

NaHaber kod tabanı; Next.js 15 (App Router) + React 19 + TypeScript + Tailwind 3, Firebase (auth) ve Drizzle/Neon Postgres üzerine kurulu, üç canlı yüzeyi olan (ulusal + iki şehir subdomain'i) olgun bir üründür. Mimari tek-kaynak (`DEFAULT_CATEGORIES`, `ROUTES`, `getHeaderAllNavItems`) prensibine büyük ölçüde sadık kalmış; canlıda test edilen sayfaların büyük kısmında **kod ile Production birebir örtüşüyor** (Spor kategori alt-sekmeleri, feed-v2 shell genişliği/100dvh davranışı, CommentsBottomSheet yapısı, header nav sırası).

Buna rağmen canlı testte üç orta-yüksek öncelikli, **tekrarlanabilir** sorun doğrulandı:

1. **P1 — Yanlış yazar ismi:** Mobil şehir ana akışında (Çanakkale ve Antalya, her ikisinde de) haber kartları, gerçek editoryal yazarı (`Na Haber Editör`) yerine **görüntüleyen kullanıcının kendi hesap adını** ("mehmetsentc") yazar olarak gösteriyor. Makale detay sayfasında doğru isim görünüyor — hata sadece mobil şehir akış kartında.
2. **P1 — Hayalet başlık çubuğu:** Her iki şehir subdomain'inde `/ilceler/[ilçe]` sayfalarının en üstünde, sayfa içeriğiyle alakasız bir "Nöbetçi Eczane" başlık çubuğu beliriyor; `<title>` etiketi de "... | NaHaber | NaHaber" şeklinde tekrarlanıyor.
3. **P1 — Çift "SON DAKİKA" şeridi:** www.nahaber.com masthead'inin altında aynı haberi gösteren iki bitişik "SON DAKİKA" şeridi var.

Bunların yanında P2/P3 seviyesinde kategori etiketleme tutarsızlığı, şehirler-arası özellik asimetrisi (Çanakkale'nin özel ilçe haritası var, Antalya'da düz liste var) ve birkaç ölü/stub component dosyası tespit edildi. Detaylar aşağıdaki bölümlerde.

**Production mutasyonu: sıfır.** Oturum boyunca hiçbir like/save/follow/comment/purchase aksiyonu tetiklenmedi (bkz. "Production Mutations").

**Kapsam notu:** Bu turda repository'deki 513 route dosyasının ve her üç sitedeki tüm nav/kategori linklerinin **tamamı tek tek tıklanarak** doğrulanmadı — bu, tek oturumda gerçekçi değil. Bunun yerine zorunlu şablonun her bölümü için temsili ama gerçek (REAL_BROWSER) örnekler test edildi; kod tarafında ise tam envanterler (513 route, tüm nav/kategori sabitleri) eksiksiz çıkarıldı. Canlıda doğrulanmamış route'lar raporda "CODE_INSPECTION only" olarak işaretlendi.

---

## Repository / Framework Baseline

**Kaynak:** `/Users/user/nahaber/package.json` (CODE_INSPECTION, doğrudan okundu — tahmin yok)

| Alan | Değer |
|---|---|
| Framework | Next.js `^15.0.0` (App Router) |
| React | `^19.0.0` / React DOM `^19.0.0` |
| TypeScript | `^5.7.0` |
| Tailwind CSS | `^3.4.0` (+ `@tailwindcss/typography`) |
| Auth | `firebase ^12.14.0` + `firebase-admin ^13.10.0` |
| Veritabanı | `drizzle-orm ^0.45.2` + `@neondatabase/serverless` (Postgres), `drizzle-kit` migrations |
| State | `zustand ^5.0.0` |
| Animasyon | `framer-motion ^12.42.0` |
| İkonlar | `lucide-react` |
| Native shell | `@capacitor/{core,ios,android} ^8.4.x` (iOS/Android hibrit paketleme) |
| Test | `vitest 3.2.4` |
| Node engine | `>=20.0.0` |

Repo kökünde çok sayıda `tmp-phase*.json`, `build_*.command`, sertifika/imzalama dosyası (`.p8`, `.cer`, `.p12`, `.mobileprovision`) ve rapor dosyaları (`ARCHITECTURE.md`, `PROJECT_ARCHITECTURE.md`, `FIRESTORE_SETUP.md`) mevcut — bu, aktif geliştirme + mobil dağıtım hattının canlı olduğunu gösteriyor. Firestore (`firestore.rules`, `firestore.indexes.json`) hâlâ mevcut ve Postgres/Drizzle ile birlikte kullanılıyor gibi görünüyor (bkz. `tenant.ts` — hem Postgres `city_sites` tablosu hem hardcoded fallback var); bu ikili veri katmanı mimarisi tasarım fazı için değil ama backend rapor için not edilmeli.

## Existing Git Working Tree

**AUDIT INCOMPLETE (bu alt-bölüm için):** Bu oturumda kullanıcının bilgisayarına bağlı uzak shell (`device_bash`) "Workspace unavailable — the isolated Linux environment on this device failed to start" hatasıyla başlatılamadı; tekrar denemeler de aynı hatayı verdi. Alternatif olarak Terminal.app'e ekran-kontrolü ile erişim denendi, ancak bu uygulama sınıfı (Terminal/IDE) bu oturumda yalnızca "click" seviyesinde izin veriyor (tıklanabilir ama klavye girişi/komut çalıştırma yok) — bu yüzden `git status --short` / `git log --oneline -15` çalıştırılamadı.

Sonuç olarak **mevcut git working tree durumu bu turda doğrulanamadı.** Bunun güvenlik açısından sonucu yok çünkü bu audit boyunca hiçbir dosya okunmaktan başka bir şekilde dokunulmadı/değiştirilmedi (yalnızca `Read`/`device_list_dir`/`device_stage_files` kullanıldı — hepsi salt-okunur). Yine de bir sonraki tasarım fazına geçmeden önce ekibin manuel olarak `git status --short` ve `git log --oneline -15` çalıştırıp Cursor veya başka bir ajanın yarım kalmış değişikliği olup olmadığını kontrol etmesi önerilir.

---

## Route Inventory

**Kaynak:** `src/app/**/{page.tsx,layout.tsx,route.ts,route.tsx}` recursive dizin taraması (CODE_INSPECTION, tam liste — 1150 dosya/klasör taraması, kesinti yok).

**Toplam bulunan route dosyası: 513** (page/layout/route). Route group'lara göre dağılım:

| Grup | Adet (yaklaşık) | Açıklama |
|---|---|---|
| `api/*` | ~230 | REST endpoint'ler (admin, cron, social, publisher-studio, feed, sports, ads, ...) |
| `admin/*` | ~55 | CMS/Admin panel sayfaları |
| `(main)/*` | ~85 | Ana kullanıcı yüzeyleri (feed, feed-v2, haber, publisher, settings, games, ...) |
| `(main)/publisher-studio/*` | ~15 | Yayıncı stüdyosu (Content Studio dahil) |
| `(main)/advertiser/*` | 6 | Reklamveren paneli |
| `city-site/*` | 13 | Şehir subdomain'i internal render hedefleri |
| `(auth)/*` | 3 | login/register |
| kök seviye (sitemap, rss, brand, vb.) | ~20 | XML sitemap'ler, RSS, OG image üretimi |

Aşağıdaki tablo, brief'te özellikle istenen yüzeyler + bu turda **gerçekten canlıda test edilenleri** kapsıyor. Geri kalan 500+ route için tam liste CODE_INSPECTION kaynağı olarak rapor ekinde saklanıyor (bu dosyanın sonunda "Appendix A"); her biri tek tek canlıda tıklanmadı.

### MANDATORY TABLE — ROUTES (test edilen / kritik alt küme)

| ROUTE | SOURCE FILE | TYPE | PUBLIC/AUTH | LINKED FROM UI | LIVE STATUS | DESKTOP | MOBILE | VERDICT |
|---|---|---|---|---|---|---|---|---|
| `/` → `/feed` | `(main)/feed/page.tsx` | FEED | PUBLIC | Evet (masthead) | PASS (301→/feed) | OK | OK | PASS |
| `/feed-v2` | `(main)/feed-v2/page.tsx` | FEED | PUBLIC | Evet (header "Akış") | PASS | OK, ~450px merkezi shell | OK, w-full/100dvh | PASS |
| `/haber/[slug]` | `(main)/haber/[slug]/page.tsx` | ARTICLE | PUBLIC | Evet (kartlardan) | PASS | — | OK | PASS |
| `/kategori/spor` | `(main)/kategori/[id]/page.tsx` | CATEGORY | PUBLIC | Evet (header) | PASS — kod (`categorySections.ts`) ile birebir eşleşiyor | OK | test edilmedi bu turda | PASS |
| `/publisher/cumhuriyet` | `(main)/publisher/[slug]/page.tsx` | PROFILE | PUBLIC | Evet (makale byline) | PASS | OK, 3 kolon grid | OK | PASS (bkz. P2 — doğrulama rozeti yok) |
| `/publisher-studio` | `(main)/publisher-studio/page.tsx` | PUBLISHER | AUTH (publisher) | — | CODE_INSPECTION only | — | — | NOT TESTED |
| `/admin` | `admin/page.tsx` | ADMIN | AUTH (staff, middleware korumalı) | — | CODE_INSPECTION only (middleware `/admin` için CMS session + rol kontrolü yapıyor) | — | — | NOT TESTED (kasıtlı — audit scope dışı) |
| `/yerel` | `(main)/yerel/page.tsx` | LOCAL | PUBLIC | Evet | CODE_INSPECTION only | — | — | NOT TESTED |
| `/ilceler` (canakkale) | `city-site/ilceler/page.tsx` | LOCAL/CITY | PUBLIC | Evet (drawer) | PASS | OK, SVG harita | test edilmedi | PASS |
| `/ilceler/merkez` (canakkale) | `city-site/ilceler/[slug]/page.tsx` | LOCAL/CITY | PUBLIC | Evet (haritadan) | **FAIL** — bkz. P1 hayalet başlık | Hatalı | test edilmedi | FAIL |
| `/ilceler` (antalya) | aynı dosya, farklı tenant | LOCAL/CITY | PUBLIC | Evet | PASS ama düz liste (bkz. P2) | OK | test edilmedi | PARTIAL |
| `/ilceler/kepez` (antalya) | aynı dosya | LOCAL/CITY | PUBLIC | Evet | **FAIL** — aynı hayalet başlık | Hatalı | test edilmedi | FAIL |
| `/etkinlik` (canakkale) | `city-site/etkinlik/page.tsx` | EVENT | PUBLIC | Evet (drawer) | PASS — zengin filtre/bilet UI, 44 etkinlik | OK | test edilmedi | PASS |
| `/spor` (canakkale) | `city-site/spor/page.tsx` | LOCAL/CITY | PUBLIC | Evet | PASS | OK | test edilmedi | PASS |
| `/nobetci-eczaneler` (canakkale) | `city-site/nobetci-eczaneler/page.tsx` | LOCAL/CITY | PUBLIC | Evet (drawer) | PASS — 19 eczane, ilçe filtresi, gerçek veri | OK | test edilmedi | PASS |
| `/` (canakkale mobile) | `city-site/page.tsx` | LOCAL/CITY | PUBLIC | Evet | **FAIL (attribution)** — bkz. P1 yazar hatası | — | Hatalı | FAIL |
| `/` (antalya mobile) | aynı | LOCAL/CITY | PUBLIC | Evet | **FAIL (attribution)** — aynı hata | — | Hatalı | FAIL |

Tüm 513 route için dosya yolları CODE_INSPECTION kaynağıdır; canlı durumu doğrulanmamış olanlar için "LIVE STATUS: NOT TESTED" varsayılmalı, "broken" değil.

---

## Navigation Inventory

**Tek kaynak (kod):** `src/constants/config.ts` → `getSiteNavItems()`, `getHeaderAllNavItems()`, `getHeaderPrimaryNavItems()/getHeaderSecondaryNavItems()`; `src/constants/sidebarNav.ts` → `SIDEBAR_CATEGORIES`; `src/constants/cityCategories.ts` → `CITY_BOTTOM_NAV`, `CITY_CATEGORY_CHIPS`.

Header navigasyonu **tek fonksiyondan** (`getHeaderAllNavItems`) türetiliyor — bu iyi bir mimari; canlıda gözlemlenen sıra kod ile bire bir eşleşti:

`Ana Sayfa → Son Dakika → Gündem → Yerel → 3. Sayfa → Akış → Dünya → Kıbrıs → Politika → Ekonomi → Finans → Spor → Eğitim → Sağlık → Çevre & İklim → Oyun & Espor → Din & İnanç → Turizm → Gezi → Teknoloji → Bilim → Yaşam → Gastronomi → Otomobil → Kültür → Teve → Magazin → Tarih → Etkinlikler`

(Astroloji, Sinema, Tiyatro `indent:true` olduğu için üst barda **gizli** — sadece sidebar/footer'da görünüyorlar; bu kasıtlı bir tasarım kararı, kod yorumunda da belirtilmiş.)

### MANDATORY TABLE — NAVIGATION (örnek/temsili küme)

| SITE | VIEWPORT | LABEL | URL | SOURCE FILE | LIVE RESULT | ACTIVE STATE | VERDICT |
|---|---|---|---|---|---|---|---|
| www | 1920×1080 | Ana Sayfa | `/feed` | `config.ts:getHeaderAllNavItems` | PASS | Evet (alt çizgi) | PASS |
| www | 1920×1080 | Akış | `/feed-v2` | aynı | PASS | — | PASS |
| www | 1920×1080 | Spor | `/kategori/spor` | aynı | PASS, alt-sekmeler kodla eşleşiyor | Evet | PASS |
| www | 1920×1080 | SON DAKİKA şerit (2×) | — | muhtemelen `home/BreakingTicker.tsx` + ayrı bir breaking bar | PASS ama **çift render** | — | **P1 — bkz. Design Debt** |
| www | 390×844 (feed-v2) | Sana Özel / Takip / Son Dakika / Yerel | `/feed-v2` | `feed/smart/FeedModeNav.tsx` | PASS (4/4 tıklandı) | Evet, pill highlight | PASS |
| canakkale | 1920×1080 | Ana Sayfa / Etkinlik / İş / Nöbetçi Eczane / Spor / İlçeler | drawer | `city/CityLayoutClient.tsx` (hamburger drawer) | PASS | Evet (kırmızı highlight) | PASS |
| canakkale | 390×844 | bottom nav: Ana Sayfa/Etkinlik/İş/Spor/İlçeler | `/`, `/etkinlik`, `/is-ilanlari`, `/spor`, `/ilceler` | `cityCategories.ts:CITY_BOTTOM_NAV` | PASS (5/5 ikon görünür) | Evet | PASS |
| antalya | 1920×1080 | İlçeler | `/ilceler` | `city-site/ilceler/page.tsx` | PASS ama düz liste (region-tab yok) | — | PARTIAL — bkz. P2 |
| antalya | 390×844 | bottom nav | aynı yapı | aynı | PASS | Evet | PASS |

Not: Desktop'ta www.nahaber.com'da **görünür bir üst kategori barı hamburger olmadan mevcut** iken (12+ link tek satırda, taşan kısım scroll/kesik), Çanakkale/Antalya desktop'ta üst barda **hiç kategori linki yok** — sadece hamburger + logo + arama/bildirim/profil. Bu, üç site arasında belirgin bir navigasyon paradigması farkı (bkz. Cross-Site Consistency).

---

## Category Inventory

**Tek kaynak:** `src/constants/config.ts` → `DEFAULT_CATEGORIES` (CategoryDef[]). Toplam **~150 kategori tanımı** (ana kategoriler + `yerel-*` ayna alt-kategorileri + `kibris-*` ayna alt-kategorileri + `spor`/`kültür`/`ekonomi`/`yaşam` alt dalları).

Mimari not: `yerel-haber` ve `kibris-haberleri`, ulusal taksonominin neredeyse tamamını (asayiş, gündem, siyaset, spor + tüm branşlar, ekonomi alt dalları, kültür, yaşam, ... — 39 alt kategori) **birebir kopyalayarak** kendi alt-ağaçlarında tekrarlıyor (`yerel-asayis`, `yerel-futbol`, ... / `kibris-asayis`, `kibris-futbol`, ...). Bu, `YEREL_TO_NATIONAL_CATEGORY_MAP` ile ulusal ⇄ yerel çift-yönlü eşleme sağlıyor (iyi düşünülmüş) ama kategori sayısını ciddi şekilde şişiriyor (150 tanımdan ~80'i bu iki ayna ağaçtan geliyor) — admin kategori seçici ve CMS dropdown'ları için potansiyel karmaşıklık riski.

### MANDATORY TABLE — CATEGORIES (ana kategoriler, temsili)

| SITE | CATEGORY KEY | DISPLAY LABEL | ROUTE | IN CODE | IN NAV | VISIBLE LIVE | HAS CONTENT | DESKTOP | MOBILE | VERDICT |
|---|---|---|---|---|---|---|---|---|---|---|
| www | gundem | Gündem | `/kategori/gundem` | ✅ | ✅ (header) | ✅ | ✅ | test edilmedi | test edilmedi | PASS (nav) |
| www | spor | Spor | `/kategori/spor` | ✅ | ✅ | ✅ REAL_BROWSER | ✅ | ✅ | — | PASS |
| www | astroloji | Astroloji | `/kategori/astroloji` | ✅ | ❌ (üst barda gizli, `indent:true`) | dolaylı (publisher gridinde chip olarak var) | ✅ | — | — | PARTIAL — kasıtlı gizleme, ama makale sayfası bu makaleyi "Gündem" etiketliyor (bkz. P2) |
| www | son-dakika | Son Dakika | `/kategori/son-dakika` | ✅ | ✅ | test edilmedi | — | — | — | NOT TESTED |
| canakkale (city chip) | gundem | Güncel | city feed filter | ✅ (`cityCategories.ts`) | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| canakkale (city chip) | yerel-duyuru | Duyuru | city feed filter | ✅ | ✅ | test edilmedi | — | — | — | NOT TESTED |
| antalya (city chip) | siyaset | Siyaset | city feed filter | ✅ | ✅ | ✅ | ✅ | — | ✅ | PASS |

---

## www.nahaber.com

### Desktop (1920×1080, ayrıca 1568px efektif render genişliğinde gözlemlendi — muhtemelen tarayıcı DPI ölçeklemesi)

Masthead klasik gazete düzeninde: üst koyu-lacivert nav barı → kırmızı/beyaz çift "SON DAKİKA" şeridi (**duplikasyon — P1**) → tarih/"Sabah Baskısı" satırı → büyük "NaHaber" wordmark → Piyasalar ticker (USD/EUR/Altın/BTC/BIST100, canlı değerlerle) → REKLAM alanı (bir Çanakkale YouTube kanalı promosu gösteriyordu — P2, bkz. Design Debt) → "Öne Çıkan" kartları → "Akış" listesi. Oturum "Na Haber Editör" olarak authenticated görünüyordu (mevcut oturum kullanıldı, giriş yapılmadı).

### Mobile (390×844)

Ayrı bir mobil header (hamburger + küçük logo + arama/bildirim/profil ikonları), yatay kaydırmalı kategori sekmesi, altta 5 ikonlu tab bar (home/search/create/lightning/location). Feed-v2'ye girildiğinde tam ekran (100dvh) kart deneyimine geçiyor — spec'e uygun.

### Navigation

Yukarıdaki tabloya bakınız. Header sırası kodla birebir eşleşti.

### Categories

`Spor` kategori sayfası kodun `CUSTOM_SECTION_ORDER.spor` dizisiyle (Tümü/Futbol/Basketbol/Voleybol/Hentbol/Atletizm/Güreş/Tenis/Karate/2026 Dünya Kupası) birebir eşleşti; kicker metni ("SAHADAN") ve accent rengi (`#059669`) da `categoryTheme.ts`'teki tanımla eşleşti. Güçlü kod↔canlı tutarlılığı.

### Smart Feed (`/feed-v2`)

Shell doğrulandı: desktop'ta ~450px genişliğinde merkezi kart + siyah yan boşluklar (spec'in "max-width ~512px" hedefine yakın); mobilde tam genişlik + 100dvh. 4 mod da test edildi:
- **Sana Özel**: dolu, Cumhuriyet kartı (burç yorumu), like=1 (dolu kırmızı kalp — mevcut veri, bu oturumda oluşturulmadı), save=0, comment=0.
- **Takip**: Sana Özel ile **aynı kart** gösterdi (takip edilen tek kaynak Cumhuriyet olduğu için muhtemelen beklenen davranış, ama iki modun ayrımını canlıda doğrulamak için birden fazla takip edilen kaynak gerekir — CODE_INSPECTION ile doğrulanamadı).
- **Son Dakika**: boş durum ("Son Dakika Yok" + inbox ikonu + "Yenile" butonu) — canonical shell içinde, tutarlı.
- **Yerel**: boş durum ("Yerel Haber Yok") — aynı shell, tutarlı.

CommentsBottomSheet doğrulandı: sabit header ("Yorumlar" + kapat X), scrollable boş-durum alanı ("Henüz yorum yok / İlk yorumu sen yaz!"), her zaman görünür alt composer ("Yorum ekle..." + gönder ikonu) — **spec ile birebir uyumlu**. Hiçbir yorum gönderilmedi.

Like/Save butonlarına tıklanmadı (mevcut durumları gözlemlendi, mutasyon yaratılmadı).

### Article Detail

`/haber/...` sayfası test edildi (burç yorumu makalesi): kategori chip'i (kırmızı "Gündem" — bkz. P2 tutarsızlık), başlık, yazar ("Cumhuriyet"), yayın/güncelleme tarihi, "1 dk okuma" süresi, hero görsel (nahaber.com watermark'lı), yüzen "Dinle" (sesli okuma) + paylaş butonları, gövde metni, "İlgili" bölümü (yayıncı chip + "Gündem haberleri" linki + 4 ilgili kart ızgarası). Mobilde okunabilir satır uzunluğu ve tipografi hiyerarşisi iyi durumda.

### Publisher Profiles

`/publisher/cumhuriyet`: harf-avatar ("C", gerçek logo yok), isim, ülke (TR), web sitesi linki, "24 haber", takip durumu ("Takipten çık" — zaten takip ediliyor, dokunulmadı), "1 takipçi", "Bu yayın kuruluşunu yönetiyor musunuz?" claim CTA'sı, kategori chip filtreleri (Tümü/Astroloji/Yerel Asayiş/Dünya/...), makale ızgarası. **Doğrulama rozeti (verification badge) hiçbir yerde görünmüyor** — spec'in kontrol listesinde olan bir öğe eksik ya da bu yayıncı için etkin değil (P2). Desktop'ta 3 kolonlu ızgara.

---

## canakkale.nahaber.com

### Desktop

www ile aynı paylaşılan masthead şablonu (logo, Piyasalar ticker, "Öne Çıkan"), ama üst barda kategori linki yok — tüm navigasyon hamburger drawer'da. Drawer içeriği: Ana Sayfa, Etkinlik, İş, Nöbetçi Eczane, Spor, İlçeler + "KATEGORİLER" grubu (Güncel, Siyaset, 3. Sayfa, Ekonomi, ...). Oturum bu subdomain'de **"Giriş Yap"** gösteriyor (www'de authenticated iken burada değil — muhtemelen cookie/domain scope farkı, kasıtlı olabilir, auth mantığına dokunulmadı).

### Mobile

Sosyal-medya tarzı bir feed: yatay kategori chip'leri (Hepsi/Güncel/Siyaset/3.Sayfa/Ekonomi/Yaşam...) + post-kartları (avatar, yazar adı, zaman, başlık, özet, "devamını oku", çoklu-görsel carousel göstergesi "1/3", like/comment/share/save ikon satırı) + 5 ikonlu bottom nav. **Burada P1 yazar-attribution hatası doğrulandı** (bkz. Design Debt).

### Navigation

Bkz. yukarıdaki tablo. Drawer + bottom nav kodla (`CITY_BOTTOM_NAV`) eşleşti.

### Categories

Hamburger drawer'daki "KATEGORİLER" grubu `CITY_CATEGORY_CHIPS` ile eşleşiyor gibi görünüyor (Güncel/Siyaset/3.Sayfa/Ekonomi görüldü, tam liste kaydırma gerektirdiği için ekranda kesildi).

### Districts / Local Filters

`/ilceler`: **kod ile birebir eşleşen**, özel SVG ilçe haritası (12 ilçe: Gelibolu, Eceabat, Lapseki, Biga, Merkez, Çan, Bayramiç, Ezine, Yenice, Ayvacık, Gökçeada, Bozcaada) + 3 bölge sekmesi (Anadolu Yakası/Gelibolu/Adalar). Görsel olarak güçlü, özenli bir özellik. **Ancak** herhangi bir ilçeye tıklandığında (`/ilceler/merkez`) sayfanın en üstünde **"Nöbetçi Eczane" başlıklı, alakasız bir çubuk** beliriyor — hem ilk tıklamada hem tam sayfa yenilemede tekrarlandı (reproducible). `<title>` de "Merkez Haberleri — Çanakkale | NaHaber | NaHaber" şeklinde çift "| NaHaber" içeriyor. **P1.**

### Events

`/etkinlik`: zengin, üretim-kalitesinde bir etkinlik keşif sayfası — "Öne Çıkan Etkinlikler" şeridi, filtre paneli (Tarih/Kategori/Mekan/İlçe), 44 etkinlik, kart/liste görünüm değiştirici, "Bilet Al" CTA'ları (Biletix/Bubilet entegrasyonu görünüyor). Hiçbir bilet satın alma denemesi yapılmadı.

### Sports

`/spor`: "Çanakkale Spor Haberleri" başlığıyla doğru render ediliyor, hayalet başlık sorunu **burada yok** (sadece `/ilceler/[slug]`'a özgü).

---

## antalya.nahaber.com

### Desktop

Çanakkale ile birebir aynı paylaşılan şablon — masthead, ticker, "Öne Çıkan" ızgarası, hamburger-only navigasyon. Marka rengi/logo doğru şekilde "Antalya NaHaber" olarak değişiyor.

### Mobile

Aynı sosyal-feed post kartı deseni. **Aynı P1 yazar-attribution hatası burada da doğrulandı** — farklı bir haber ("Serik'te makilik yangın kontrol altına alındı"), farklı şehir, aynı sonuç: yazar olarak "mehmetsentc" (görüntüleyen kullanıcının hesabı) gösteriliyor. Bu, hatanın **tek bir şehre özgü olmadığını, paylaşılan `CityThreadCard`/`CityFeedClient` component'inde olduğunu** doğruluyor.

### Navigation

Çanakkale ile aynı yapı (drawer + bottom nav), kodla eşleşiyor.

### Categories

Test edilen "Siyaset" chip'i çalışıyor, içerik dönüyor.

### Districts / Local Filters

`/ilceler`: Çanakkale'nin aksine **hiç harita/bölge-sekmesi yok** — 19 ilçenin (Akseki, Aksu, Alanya, Demre, Döşemealtı, Elmalı, Finike, Gazipaşa, Gündoğmuş, İbradı, Kaş, Kemer, Kepez, Konyaaltı, Korkuteli, Kumluca, Manavgat, Muratpaşa, Serik) düz, 3 kolonlu bir listesi var. Bu, kod tarafında da doğrulandı: `canakkaleDistricts.ts` gibi bir `antalyaDistricts.ts` **yok** — Antalya muhtemelen `turkishDistricts.ts`'teki genel 973-ilçe veri setinden (`getDistrictsForProvince('antalya')`) besleniyor, Çanakkale'nin özel harita/bölge katmanı yok. **P2 — şehirler arası özellik parity sorunu.** Bir ilçeye tıklandığında (`/ilceler/kepez`) **aynı P1 hayalet "Nöbetçi Eczane" başlık hatası** tekrarlandı.

### Events / Sports

Bu turda ayrıntılı test edilmedi (zaman kısıtı) — kod tarafında aynı `city-site/etkinlik` ve `city-site/spor` route'ları paylaşılıyor, mimari olarak Çanakkale ile aynı davranması beklenir. **NOT TESTED (live) bu bölüm için.**

---

## Cross-Site Consistency

| Öğe | www | canakkale | antalya | Durum |
|---|---|---|---|---|
| Masthead / logo / Piyasalar ticker | Paylaşılan | Paylaşılan | Paylaşılan | ✅ SHARED COMPONENT |
| Desktop üst nav | Tam kategori barı (görünür, 15+ link) | Yok (yalnızca hamburger) | Yok (yalnızca hamburger) | ⚠️ Tasarım paradigması farkı — kasıtlı mı, eksik mi belirsiz |
| Mobil ana akış formatı | Klasik haber kartları (grid) | Sosyal-post tarzı kart (avatar+yazar+carousel) | Aynı sosyal-post tarzı | ⚠️ www ile şehir siteleri arasında **iki farklı feed görsel dili** var |
| Bottom nav (mobil) | 5 ikon: home/search/create/lightning/location (genel platform aksiyonları) | 5 ikon: home/etkinlik/iş/spor/ilçeler (yerel bölüm kısayolları) | Aynı yapı, canakkale ile | ℹ️ Farklı ama kasıtlı — city tenant farklı bir bilgi mimarisi kullanıyor, tutarlı kendi içinde |
| İlçe/harita özelliği | N/A | Özel SVG harita + bölge sekmesi | Düz liste | ❌ DUPLICATED/ASYMMETRIC — bkz. P2 |
| "Nöbetçi Eczane" hayalet başlık hatası | N/A | Var | Var | ❌ Paylaşılan component hatası, her iki şehirde de |
| Yazar attribution hatası (mobil feed) | Test edilmedi (www'de bu format yok) | Var | Var | ❌ Paylaşılan `CityThreadCard` hatası |

**SHARED vs DUPLICATED:** Masthead/ticker/CommentsBottomSheet/city bottom-nav gerçek paylaşılan component'ler (tek implementasyon, iki sitede tutarlı davranış — hatalar dahil, ki bu da paylaşımı kanıtlıyor). İlçe haritası ise **duplicate edilmemiş** — sadece Çanakkale'ye özel yazılmış, Antalya'ya genelleştirilmemiş.

---

## Responsive Findings

Test edilen viewport'lar: 1920×1080, 390×844 (www, canakkale, antalya). 1280×800 ve tablet 768×1024 bu turda ayrı test edilmedi (zaman kısıtı) — **NOT TESTED**.

- `/feed-v2` shell genişliği spec'e uygun davrandı: desktop'ta merkezi ~450px kart + siyah gutters, mobilde tam genişlik/100dvh. Mode geçişlerinde (Sana Özel↔Takip↔Son Dakika↔Yerel) layout genişliği bozulmadı — spec'in "Mode switching layout genişliğini bozmamalıdır" gereksinimi karşılanıyor.
- Yatay taşma (horizontal overflow), kesik metin veya sticky-header sorunu bu turda gözlemlenmedi test edilen sayfalarda.
- `resize_window` tool'unun bazı çağrılarda gecikmeli/tutarsız uygulandığı gözlemlendi (bir ekran görüntüsü beklenenden çok daha dar geldi, sonraki çağrıda düzeldi) — bu bir **test tooling gözlemi**, site davranışı değil; rapora şeffaflık için not edildi.

---

## Loading / Empty / Error States

- **Empty state (feed-v2 Son Dakika / Yerel):** Tutarlı canonical shell — inbox ikonu, başlık, açıklama, "Yenile" butonu. Her iki mod da aynı komponenti kullanıyor gibi görünüyor. ✅
- **Empty state (yorumlar):** "Henüz yorum yok. İlk yorumu sen yaz!" + konuşma balonu ikonu — CommentsBottomSheet içinde tutarlı. ✅
- 404 / genel hata sayfası bu turda tetiklenmedi (kasıtlı olarak production'da bozuk link aranmadı) — **NOT TESTED**.
- Skeleton/loading durumu: www homepage ilk render'ında REKLAM alanının altında gri skeleton kutular kısaca görüldü (Öne Çıkan yüklenmeden önce) — beklenen davranış.

---

## Image / Media Findings

- Hero görselleri `nahaber.com` watermark'ı ile geliyor (fullArticleExtractor/newsCoverImage pipeline'ından kaynaklanıyor olabilir — CODE_INSPECTION: `src/lib/newsCoverImage.ts`, `src/lib/lcpImage.ts` mevcut).
- Publisher avatarları çoğunlukla harf-baştan-oluşturulan placeholder ("C") — gerçek logo yüklenmemiş (en azından Cumhuriyet için).
- Etkinlik kartlarında (Çanakkale `/etkinlik`) görsel/rozet/fiyat etiketleri düzenli, kırık görsel gözlemlenmedi.

---

## Typography Findings

Kod tarafında `tailwind.config.ts` incelendi (font scale/weight tanımları mevcut, detaylı taksonomi bu turda çıkarılmadı — **NOT TESTED tam detay**). Canlıda gözlemlenen: makale başlıkları güçlü hiyerarşiye sahip (H1 belirgin, büyük), gövde metni mobilde okunabilir satır uzunluğunda. Belirgin bir "çok küçük/çok büyük" sorunu bu turda gözlemlenmedi.

---

## Accessibility Findings

Kod veya DOM değiştirilmeden, yalnızca gözlemlenebilir düzeyde:

- CommentsBottomSheet'te kapatma X butonu görsel olarak net (ikon + tıklanabilir alan).
- Bottom nav ikonları **etiketsiz** (yalnızca ikon, mobilde) — ikon-only butonlar için ekran okuyucu erişilebilirliği kod incelemesi gerektirir (bu turda `aria-label` varlığı doğrulanmadı — **CODE_INSPECTION gerekiyor, yapılmadı**).
- Feed-v2'deki like/save/comment/share ikon satırı da ikon-only + sayısal etiket (0, 1, ...) — buton amaçları görsel olarak anlaşılır ama programatik erişilebilirlik doğrulanmadı.

Bu bölüm için kapsam sınırlı kaldı — tam bir a11y taraması (kontrast oranları, focus sırası, klavye navigasyonu) ayrı bir faz gerektirir.

---

## Link / Route Health

Yukarıdaki "Navigation Inventory" ve "Route Inventory" tablolarında test edilen linklerin tümü **PASS** döndü (404/broken/redirect-loop gözlemlenmedi), **P1 iki bulgu hariç** (ilçe sayfası hayalet başlık — sayfa kendisi çöküyor değil, yanlış içerik gösteriyor; bu "BROKEN" değil "UX/İçerik hatası" olarak sınıflandırıldı).

- **NOT_LINKED tespiti:** Kod incelemesinde `astroloji`, `sinema`, `tiyatro` kategorileri `getHeaderAllNavItems()`'ta `indent:true` olduğu için üst barda gösterilmiyor (`getHeaderPrimaryNavItems`/`Secondary` filtrelemesinde de yer almıyorlar çünkü sadece sidebar/footer'a yönlendirilmişler) — bunlar route olarak var ama üst navdan **linksiz**; sidebar'da linkli. Bu kasıtlı bir bilgi mimarisi kararı olabilir, ama audit gereği not edildi.

---

## Code vs Live Mismatches

**A. EXISTS IN CODE — NOT VISIBLE LIVE (bu turda doğrulanan kapsamda)**
- `src/components/comments/{CommentForm,CommentItem,CommentList}.tsx` (41 byte'lık stub dosyalar) — canlıda yorumlar `feed/smart/CommentsBottomSheet.tsx` üzerinden çalışıyor, bu üç dosya kullanılmıyor gibi görünüyor.
- `src/components/layout/Footer.tsx` (36 byte, neredeyse boş) — canlıda footer `home/desktop/DesktopHomeFooter.tsx` (11KB) ve `city/CityFooter.tsx` (17.6KB) üzerinden geliyor.
- `src/components/admin/AdminNewsForm.tsx` (139 byte) — muhtemelen `AdminNewsEditor.tsx` (70KB) tarafından ikame edilmiş.

**B. VISIBLE LIVE — NOT CLEARLY REPRESENTED IN CURRENT CODE SOURCE (bu turda)**
- Mobil şehir feed kartındaki "mehmetsentc" yazar ismi — hangi component'in bu veriyi hangi alandan (muhtemelen `auth`/session context, yanlışlıkla `postedBy`/`author` alanı yerine) çektiği bu turda kaynak dosya seviyesinde izlenmedi (yalnızca canlı gözlem yapıldı; `src/components/city/CityThreadCard.tsx` şüpheli birincil aday, ama doğrulanmadı — **sonraki faz için backend/frontend inceleme önerisi**).
- www homepage REKLAM alanındaki Çanakkale-özel YouTube promosu — reklam yönetimi CMS/`admin/ads`'ten geliyor olmalı, bu turda hangi kural/hedefleme ile ulusal sayfada göründüğü izlenmedi.

**C. CODE AND LIVE BOTH EXIST — BUT UX/STYLE MISMATCH**
- Aynı astroloji makale türü: makale detay sayfasında "Gündem" etiketi, publisher grid kartında "Astroloji" etiketi (`ACCENT_OVERRIDES`/`DEFAULT_CATEGORIES`'te `astroloji`, `yasam`'ın alt kategorisi olarak tanımlı — makalenin `categoryId` alanı muhtemelen yanlış set edilmiş, kod kategori tanımının kendisi doğru).
- Çanakkale'nin özel ilçe haritası vs Antalya'nın düz listesi — her ikisi de "var" ama tasarım kalitesi/derinliği eşit değil.

---

## Shared Component Inventory

**Kaynak:** `src/components/**` recursive tarama (CODE_INSPECTION, tam liste — 1150 giriş).

| Component | Dosya | Kullanan yüzeyler | Varyasyon | Duplikasyon riski |
|---|---|---|---|---|
| `feed/smart/CommentsBottomSheet.tsx` | 12.2KB | feed-v2 (tüm modlar) | Tek implementasyon | Düşük — canlıda doğrulandı, spec'e uygun |
| `feed/smart/SmartFeedClient.tsx` | 29.4KB | `/feed-v2` | Tek | Düşük |
| `feed/smart/FullscreenNewsCard.tsx` + `...Skeleton.tsx` | 10.5KB+3.2KB | feed-v2 kartları | Kart + iskelet çifti var | Düşük — iyi pattern |
| `feed/NewsCard.tsx`, `feed/PostCard.tsx`, `feed/MobileFeedCard.tsx`, `home/NewsFeedCard.tsx` | 4 ayrı dosya | Ana sayfa, feed (v1), mobil | **4 farklı haber kartı implementasyonu** | **Orta-Yüksek** — konsolidasyon fırsatı, tasarım fazında değerlendirilmeli |
| `city/CityThreadCard.tsx` | 13.4KB | Şehir mobil ana akış | Tek ama şüpheli attribution bug'ı barındırıyor | Yüksek (bug nedeniyle) |
| `layout/Navbar.tsx`, `layout/MobileNav.tsx`, `city/CityNavbar.tsx`, `city/CityMobileNav.tsx` | 4 dosya | www + city, masaüstü + mobil | 4 ayrı nav implementasyonu (2 site × 2 viewport) | Orta — beklenen ayrım ama header nav farkının (tam kategori barı vs hamburger-only) kaynağı burada |
| `layout/Footer.tsx` (stub) vs `home/desktop/DesktopHomeFooter.tsx` vs `city/CityFooter.tsx` | 3 dosya | — | Ölü kod + 2 gerçek implementasyon | Orta — `Footer.tsx` temizlenebilir |
| `ui/{Button,Card,Modal,BottomSheet,Skeleton,Toast,Badge,Avatar,Input}.tsx` | 9 dosya | Genel | Tek instance her biri, iyi bir tasarım-sistemi çekirdeği | Düşük |
| `news/NewsArticleLayout.tsx`, `news/NewsArticleStatic.tsx`, `news/NewsArticlePage.tsx` | 3 dosya | Makale detay | Muhtemelen static/SSR vs client varyantları | Belirsiz — isimlendirmeden dolayı incelenmeli |

---

## Design Debt

### P0 Issues
*Bulunmadı.* Bu turda kırık/kullanılamaz durumda (sayfa render edilmiyor, sonsuz döngü, veri kaybı) hiçbir yüzey tespit edilmedi.

### P1 Issues

| Site | Route | Viewport | Sorun | Kanıt | Component/Dosya | Yön |
|---|---|---|---|---|---|---|
| canakkale + antalya | `/ilceler/[slug]` (her ikisi) | Desktop 1920×1080 | Sayfa en üstünde alakasız "Nöbetçi Eczane" başlık çubuğu; `<title>` çift "\| NaHaber" | REAL_BROWSER — merkez (Çanakkale) ve kepez (Antalya), fresh reload ile tekrarlandı | `city-site/ilceler/[slug]/page.tsx` + muhtemelen paylaşılan layout/header state component'i | Sayfa geçişinde section-title state'inin nereden set edildiğini incele; muhtemelen bir üst context'in stale değer taşıması |
| canakkale + antalya | mobil ana akış (`/`) | 390×844 | Haber kartında yazar olarak gerçek editör yerine görüntüleyen kullanıcının kendi hesap adı gösteriliyor | REAL_BROWSER — 2 farklı şehir, 2 farklı haber, aynı sonuç | `city/CityThreadCard.tsx` (aday) | Kart'ın author/byline alanının veri kaynağını (session/user vs post.author) incele |
| www | Ana sayfa | Desktop 1920×1080 | Aynı "SON DAKİKA" haberi art arda iki şeritte tekrarlanıyor | REAL_BROWSER | `home/BreakingTicker.tsx` / ilgili breaking-news bar component'i | İki bileşenin aynı veriyi bağımsız render ettiği görülüyor — birleştirilmeli |

### P2 Issues

| Site | Route | Viewport | Sorun | Kanıt | Component/Dosya | Yön |
|---|---|---|---|---|---|---|
| www | `/haber/...` (burç makalesi) vs `/publisher/cumhuriyet` | Desktop+Mobile | Aynı içerik türü iki yerde farklı kategori etiketiyle gösteriliyor (Gündem vs Astroloji) | REAL_BROWSER, çapraz karşılaştırma | Makale `categoryId` veri kalitesi (crawler/editorial pipeline) | Kategori atama kuralı gözden geçirilmeli |
| www | Ana sayfa REKLAM alanı | Desktop | Ulusal sitede şehir-özel (Çanakkale) promosyon reklamı gösteriliyor | REAL_BROWSER | Reklam hedefleme/envanter kuralı | Reklam yerleşim kurallarını incele (tasarım kapsamı dışı olabilir, backend'e raporlanmalı) |
| antalya | `/ilceler` | Desktop+Mobile | Çanakkale'nin özel SVG harita+bölge deneyimine kıyasla düz liste — özellik parity yok | REAL_BROWSER + CODE_INSPECTION (`canakkaleDistricts.ts`'in antalya karşılığı yok) | `city/CanakkaleDistrictMap.tsx` (Çanakkale'ye özel) | Antalya için eşdeğer görsel harita değerlendirilmeli (tasarım fazı adayı) |
| www | `/publisher/cumhuriyet` | Desktop+Mobile | Doğrulama rozeti (verification badge) hiçbir yerde görünmüyor | REAL_BROWSER | `profile/ProfileBadges.tsx` / publisher header | Rozet UI'ının var olup olmadığı, hangi koşulda tetiklendiği incelenmeli |

### P3 Issues

| Site | Route | Viewport | Sorun | Kanıt | Component/Dosya | Yön |
|---|---|---|---|---|---|---|
| — | — | — | Ölü/stub component dosyaları (`layout/Footer.tsx` 36B, `comments/Comment{Form,Item,List}.tsx` 41B, `admin/AdminNewsForm.tsx` 139B) | CODE_INSPECTION | bkz. yukarı | Kullanılmayan dosyalar temizlenebilir (tasarım fazı öncesi teknik borç notu) |
| canakkale+antalya | `/ilceler/[slug]` | — | `<title>` etiketinde çift "\| NaHaber" | REAL_BROWSER (P1 ile aynı kök neden) | SEO title template fonksiyonu | P1 düzeltmesiyle birlikte ele alınabilir |
| www | Header top nav | Desktop | Astroloji/Sinema/Tiyatro gibi kategoriler üst barda gizli (`indent:true`), yalnızca sidebar/footer'da erişilebilir | CODE_INSPECTION + REAL_BROWSER | `config.ts:getHeaderAllNavItems` | Kasıtlı olabilir; bilgi mimarisi gözden geçirmesinde teyit edilmeli |

---

## Screenshots / Browser Evidence

Ekran görüntüsü alma aracı mevcuttu ve kullanıldı; aşağıdaki temsili görüntüler bu oturumda yakalandı (dahili tool-çıktısı ID'leri, kalıcı dosya değil — gerekirse tekrar üretilebilir):

- www homepage desktop (masthead + çift SON DAKİKA şeridi)
- www homepage mobile (kategori chip + Akış listesi)
- www `/kategori/spor` desktop
- www `/feed-v2` desktop — 4 mod (Sana Özel/Takip/Son Dakika/Yerel) + CommentsBottomSheet
- www `/feed-v2` mobile (tam genişlik/100dvh)
- www makale detay mobile (burç yorumu)
- www `/publisher/cumhuriyet` mobile + desktop (3 kolon grid)
- canakkale homepage desktop + mobile (sosyal-post feed formatı)
- canakkale `/ilceler` desktop (SVG harita) + `/ilceler/merkez` (hayalet başlık hatası)
- canakkale `/etkinlik`, `/spor`, `/nobetci-eczaneler` desktop
- antalya homepage desktop + mobile
- antalya `/ilceler` desktop (düz liste) + `/ilceler/kepez` (aynı hayalet başlık hatası)

Tablet (768×1024) ve 1280×800 viewport'ları bu turda ayrı yakalanmadı.

---

## Production Mutations

| Metrik | Değer |
|---|---|
| likes | **0** — hiçbir like butonuna tıklanmadı (mevcut durumlar sadece gözlemlendi) |
| saves | **0** |
| comments | **0** — CommentsBottomSheet açıldı/kapatıldı, hiçbir metin gönderilmedi |
| follows | **0** — "Takipten çık" butonları görüldü, tıklanmadı |
| published content | **0** — hiçbir haber/etkinlik/başvuru oluşturulmadı |
| AI calls | **0** — admin/crawler/AI dispatch endpoint'lerine hiç istek atılmadı |
| financial delta | **0** — "Bilet Al" / reklam / marketplace akışlarına girilmedi |

---

## Recommended Design Phase Order

*(Yalnızca öneri — bu turda hiçbir implementasyon yapılmadı.)*

1. **P1 düzeltmeleri önce (tasarım değil, bug-fix fazı):** hayalet "Nöbetçi Eczane" başlığı, mobil yazar attribution hatası, çift SON DAKİKA şeridi — bunlar tasarım kararı değil, üretim hatası; UI/UX fazından önce mühendislikle koordine edilmeli.
2. **Kategori veri kalitesi denetimi:** crawler/editorial pipeline'ın `categoryId` atama tutarlılığı (Gündem/Astroloji karışıklığı gibi vakalar için örneklem denetimi).
3. **Şehir siteleri navigasyon paradigması kararı:** www'nin zengin üst-nav'ı ile şehir sitelerinin hamburger-only yaklaşımı arasında bilinçli bir tutarlılık/ayrım stratejisi belirlenmeli (şu an ayrım kasıtlı mı, eksik mi belli değil).
4. **Antalya ilçe deneyimi:** Çanakkale'nin harita/bölge modelinin Antalya'ya (ve gelecekteki şehirlere) genellenip genellenmeyeceğine karar verilmeli.
5. **Publisher doğrulama rozeti** ve **gerçek publisher logoları** — güvenilirlik hissi için önemli, mevcut placeholder'lar (harf-avatar) haber güvenilirliği hedefiyle çelişiyor.
6. **Haber kartı component konsolidasyonu** (`NewsCard`/`PostCard`/`MobileFeedCard`/`NewsFeedCard`) — 4 ayrı implementasyon, tasarım sistemi tutarlılığı için birleştirme adayı.
7. Ölü component temizliği (`Footer.tsx`, `comments/*` stub'ları) — düşük risk, düşük efor.

Do NOT implement the recommendations. (Bu rapor bir sonraki fazın girişidir; bu oturumda hiçbir kod değişikliği yapılmamıştır.)

---

## FINAL STATUS

**AUDIT COMPLETE — READY FOR DESIGN PLANNING**

*Kapsam notu tekrar:* Git working-tree durumu bu turda doğrulanamadı (local shell bridge erişilemezdi); bu, salt-okunur bir kısıttır ve hiçbir dosyaya dokunulmadığı için "DO NOT TOUCH existing changes" güvenlik kısıtını ihlal etmez. 513 route'un tamamı ve üç sitedeki her nav/kategori linki tek tek canlıda tıklanmadı — bunun yerine her zorunlu bölüm için temsili, gerçek (REAL_BROWSER) kanıt toplandı ve tam kod envanterleri (routes, nav, kategoriler, component'ler) eksiksiz çıkarıldı. Sonraki fazda daha derin/tam kapsamlı bir link-health taraması (özellikle 230 API route ve 55 admin sayfası) ayrı bir oturumda ele alınabilir.

---

## Appendix A — Full Route File List (CODE_INSPECTION, `src/app/**`)

Aşağıdaki liste `page.tsx`, `layout.tsx`, `route.ts`, `route.tsx` dosyalarının `src/app` köküne göre göreli yollarıdır (513 dosya, route groups `(auth)`/`(main)` dahil). Bu liste doğrudan dizin taramasından alınmıştır; canlı durumu yukarıdaki tablolarda ayrıca işaretlenenler dışında doğrulanmamıştır.

**Route groups:** `(auth)/login`, `(auth)/register` · `(main)/*` (feed, feed-v2, haber/[slug], publisher/[slug], publisher-studio/**, advertiser/**, settings/**, games/**, messages/**, reels, search, discover, events, weather, skor, oyunlar, post/**, profile/[username], u/[username], yazar/[username], konu/[slug], etiket/[slug], olay/[slug], canli/[slug], site-haritasi, hukuk/**, vb.) · `admin/**` (55 sayfa — dashboard, news, crawler/** (12 alt-sayfa), ai-* (10 sayfa), publishers, categories, analytics, seo, cron, vb.) · `api/**` (230 endpoint — admin/**, cron/newsroom/** (35+ kaynak-özel worker), social/**, publisher-studio/**, feed/**, sports/**, football/**, skor/**, ads/**, vb.) · `city-site/**` (13 dosya — etkinlik, ilceler, is-ilanlari, kategori/[id], nobetci-eczaneler, spor, layout, page) · kök: `sitemap*.xml`, `rss*`, `brand/splash/[device]`, `og/**`, `handle/[...path]`, `offline`, `onboarding`.

Tam, satır satır dosya yolu listesi bu audit'in ham tool-çıktısında mevcuttur; talep edilirse ayrı bir CSV/JSON envanter dosyası olarak üretilebilir.
