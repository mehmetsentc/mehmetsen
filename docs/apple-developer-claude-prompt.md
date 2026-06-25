# Apple Developer Portal — Claude Computer Use Prompt

> Bu dosya Claude'un (Computer Use yetkisi olan modelin) NaHaber için Apple
> Developer Portal + App Store Connect kurulumunu baştan sona yapması için
> yazılmış tek-parça bir prompt'tur. Tamamını kopyala, Claude'un Computer Use
> arayüzüne (Claude Desktop / claude.ai computer use beta) yapıştır ve
> çalıştır. Kullanıcı sadece login ekranlarında parola/2FA gireceği için
> yanına oturmalı.

---

## NASIL KULLANILIR

1. **Bilgisayarında Safari veya Chrome'u aç**.
2. **developer.apple.com** ve **appstoreconnect.apple.com**'a önceden giriş yap
   (Apple ID + 2FA). Claude şifreni göremez, ama oturum açıkken işlemleri yapabilir.
3. Aşağıdaki **"PROMPT — BURADAN İTİBAREN KOPYALA"** bölümünün tamamını
   kopyala, Claude Computer Use arayüzüne yapıştır.
4. Bittiğinde Claude sana 1 sayfalık özet rapor verecek (Team ID, Key ID, Bundle
   ID, App Store Connect App ID, indirilen `.p8` dosyasının yolu, vs.).
5. **`AuthKey_XXXXX.p8` dosyasını güvenli bir yere yedekle** — Apple bir
   daha indirmene izin VERMEZ.

---

## PROMPT — BURADAN İTİBAREN KOPYALA

```
Sen NaHaber adlı Türkçe haber uygulamasını Apple App Store'a yayınlamak için
gerekli tüm Apple Developer Portal ve App Store Connect ön kurulum
işlemlerini yapacaksın. Bilgisayarımı kullanarak adım adım ilerleyeceksin.
Her adımda neyi tıkladığını/yazdığını bana bildir. Bir hata, dilim uyumsuzluğu
veya beklenmedik ekran görürsen DURMA — ekran görüntüsü al, durumu anlat ve
bana sor.

═══════════════════════════════════════════════════════════════
PROJE BİLGİLERİ (ŞURADAN AL, ASLA UYDURMA)
═══════════════════════════════════════════════════════════════

App display name        : NaHaber
Bundle Identifier (App ID): com.nahaber.app
Domain                  : www.nahaber.com
Primary language        : Turkish (Türkçe)
Category                : News (Birincil)
Secondary category      : Magazines & Newspapers
Age rating              : 12+ (haber içeriği nedeniyle)
Pricing                 : Free
Description (Türkçe)    :
    NaHaber — Türkiye'nin anlık haber platformu. Son dakika
    haberler, spor, ekonomi, teknoloji, dünya ve yerel haberler
    tek uygulamada. Anlık bildirimler, çevrimdışı okuma ve
    kişiselleştirilmiş akış ile bilgi sahibi olmak hiç bu kadar
    kolay olmamıştı.
Description (İngilizce) :
    NaHaber — Turkey's real-time news platform. Breaking news,
    sports, business, technology, world and local news in one
    app. Push notifications, offline reading and a personalized
    feed keep you informed at the speed of news.
Keywords (Türkçe)       :
    son dakika, haber, türkiye, gündem, spor, ekonomi, teknoloji,
    dünya, magazin, yerel haber, nahaber, son dakika haber
Keywords (İngilizce)    :
    breaking news, turkey, news, sports, business, technology,
    world news, local news, türkçe
Privacy Policy URL      : https://www.nahaber.com/gizlilik
Marketing URL           : https://www.nahaber.com
Support URL             : https://www.nahaber.com/iletisim
Copyright               : 2026 NaHaber
Contact email           : iletisim@nahaber.com

Theme color (UI ref)    : #dc2626 (kırmızı)
Background color (UI)   : #0a0a0a (siyah)

═══════════════════════════════════════════════════════════════
GENEL KURALLAR
═══════════════════════════════════════════════════════════════

1. HER ADIMDA: önce ekran görüntüsü al, sayfanın hangi durumda olduğunu
   doğrula, sonra eylemi yap.
2. Apple Developer Portal arayüzü zaman zaman güncellenir. Bir buton
   bulamazsan: (a) sayfayı kaydır, (b) "More" / "Resources" / hamburger
   menülerine bak, (c) bana sor.
3. ASLA: yeni Apple ID açma, ödeme bilgisi değiştirme, takım üyesi
   ekleme, role transferi yapma. Sadece aşağıdaki listeyi uygula.
4. İndirilen tüm dosyaları ~/Downloads/nahaber-apple-setup/ klasörüne
   taşı. Yoksa oluştur.
5. Her FAZ sonunda bana mini bir checkpoint mesajı ver: "FAZ N tamam,
   şu değerleri topladım: ...".
6. En sonda HEPSİNİ tek bir özet tablosunda göster.

═══════════════════════════════════════════════════════════════
FAZ 0 — ÖN HAZIRLIK & DOĞRULAMA
═══════════════════════════════════════════════════════════════

0.1) Yeni bir Safari (veya Chrome) penceresi aç.
0.2) ~/Downloads/nahaber-apple-setup/ klasörünü oluştur (terminal:
     mkdir -p ~/Downloads/nahaber-apple-setup).
0.3) https://developer.apple.com/account/ aç. Eğer login isterse DUR ve
     bana söyle, ben gireyim.
0.4) Sol üstte "Membership details" veya benzeri linke tık. Şu bilgileri
     topla ve bir not defterine yaz:
       - Team Name
       - Team ID (10 karakter alfanumerik, ör. ABCDE12345)
       - Membership tipi: Individual mı, Organization mı?
       - Membership expiration date (en az 6 ay kalmış olmalı)
0.5) Eğer agreement / contract eksikse Apple uyarır. Bu durumda
     "Agreements, Tax, and Banking" sayfasına gidip eksik anlaşmaları
     incele ama BANA SORMADAN ONAYLAMA. Sadece neyin eksik olduğunu
     bildir.

CHECKPOINT FAZ 0:
- Team ID: __________
- Membership active: yes/no
- Eksik agreement var mı: yes/no (varsa hangileri)

═══════════════════════════════════════════════════════════════
FAZ 1 — APP ID OLUŞTUR
═══════════════════════════════════════════════════════════════

Hedef: com.nahaber.app Bundle ID'sini kaydet ve gerekli capability'leri aç.

1.1) https://developer.apple.com/account/resources/identifiers/list
     adresine git.
1.2) Sağ üstteki "+" butonuna tıkla. ("Register an Identifier" başlığı
     açılmalı.)
1.3) "App IDs" seç → Continue.
1.4) Type: "App" seç → Continue.
1.5) Aşağıdaki alanları doldur:
       - Description: NaHaber
       - Bundle ID: Explicit → "com.nahaber.app"
       - (Capabilities altında AŞAĞIDAKİ checkbox'ları aç:)
         [x] Associated Domains
         [x] Push Notifications
         [x] Sign In with Apple
         [x] App Groups
         [x] Background Modes (sonra Xcode'da specific modlar seçilecek)
         [x] Time Sensitive Notifications (varsa)
         (Diğerlerine DOKUNMA.)
1.6) Continue → Register.
1.7) Listede "NaHaber" satırını gör. Onaylandığını doğrula.

CHECKPOINT FAZ 1:
- Bundle ID kayıtlı: com.nahaber.app
- Capabilities açık: 5/5
- Ekran görüntüsü al: ~/Downloads/nahaber-apple-setup/01-app-id.png

═══════════════════════════════════════════════════════════════
FAZ 2 — APNS AUTHENTICATION KEY (PUSH NOTIFICATIONS İÇİN .p8)
═══════════════════════════════════════════════════════════════

Bu en kritik dosya. OneSignal'a yükleyeceğiz, native push çalışsın diye.
Apple SADECE 1 KEZ indirmeye izin verir. Kaybedersek yeni bir tane
oluşturmamız gerekir.

2.1) https://developer.apple.com/account/resources/authkeys/list
     adresine git.
2.2) Sağ üstte "+" butonu → "Register a New Key" sayfası açılır.
2.3) Key Name: "NaHaber APNs Key" yaz.
2.4) Capability listesinden [x] Apple Push Notifications service (APNs)
     işaretle.
2.5) Continue → Register.
2.6) "Download" butonu görünür. TIKLA. Dosya AuthKey_XXXXXXXXXX.p8
     adıyla iner (X'ler 10 karakter Key ID'dir).
2.7) Sayfada görünen "Key ID" değerini KOPYALA. Bu 10 karakterli bir
     string. Notuna yaz.
2.8) İndirilen .p8 dosyasını ~/Downloads/nahaber-apple-setup/ içine
     taşı. Terminal:
       mv ~/Downloads/AuthKey_*.p8 ~/Downloads/nahaber-apple-setup/
2.9) Aynı klasörde key-info.txt adında bir dosya oluştur, içine:
       Key ID    : <kopyaladığın değer>
       Team ID   : <FAZ 0'dan>
       Bundle ID : com.nahaber.app
       Auth Key  : AuthKey_<keyid>.p8
       Created   : <bugünün tarihi>
     yaz.

CHECKPOINT FAZ 2:
- AuthKey_XXXXXXXXXX.p8 indirildi: ✓
- Key ID: __________
- ~/Downloads/nahaber-apple-setup/key-info.txt yazıldı

UYARI BANA: "APNs Auth Key oluşturuldu. KULLANICI bu dosyayı yedeklemeli
— Apple bir daha indirmeye izin VERMEZ."

═══════════════════════════════════════════════════════════════
FAZ 3 — SIGN IN WITH APPLE SERVICE ID (Web entegrasyonu için)
═══════════════════════════════════════════════════════════════

App'in Google login'i var. Apple bu durumda Sign in with Apple'ı zorunlu
kılar (Guideline 4.8). Web tarafında da çalışsın diye Services ID lazım.

3.1) https://developer.apple.com/account/resources/identifiers/list/serviceId
     adresine git.
3.2) "+" butonu → Identifiers > Services IDs → Continue.
3.3) Aşağıdakileri doldur:
       - Description: NaHaber Web Sign In
       - Identifier: com.nahaber.app.web
3.4) Continue → Register.
3.5) Listede oluşturduğun Service ID'ye tıkla.
3.6) "Sign In with Apple" checkbox'ını [x] işaretle, sağındaki
     "Configure" butonuna tıkla.
3.7) Primary App ID: dropdown'dan "NaHaber - com.nahaber.app" seç.
3.8) Domains and Subdomains: aşağıdakileri ekle:
       nahaber.com
       www.nahaber.com
3.9) Return URLs: aşağıdakileri ekle:
       https://www.nahaber.com/api/auth/callback/apple
       https://nahaber.com/api/auth/callback/apple
3.10) Save → Continue → Save.
3.11) Sayfada Apple, www.nahaber.com domain'inde bir dosya doğrulaması
      ister (domain verification). Aldığın doğrulama dosyasının
      içeriğini (apple-developer-domain-association.txt) görüntüle ve
      içeriği BANA EKRANA ALARAK göster — bunu kullanıcı web tarafına
      yerleştirecek (.well-known/ altına). Henüz "Verify" butonuna
      BASMA. Bu adımı kullanıcı yapacak.

CHECKPOINT FAZ 3:
- Service ID kayıtlı: com.nahaber.app.web
- Sign In with Apple yapılandırıldı
- Domain verification dosyası: BEKLEMEDE (kullanıcı yerleştirecek)
- Verification dosyası içeriği ekran görüntüsü olarak:
  ~/Downloads/nahaber-apple-setup/03-apple-domain-verification.png

═══════════════════════════════════════════════════════════════
FAZ 4 — ASSOCIATED DOMAINS (UNIVERSAL LINKS / DEEP LINKING)
═══════════════════════════════════════════════════════════════

Hedef: www.nahaber.com linkleri (örn. www.nahaber.com/haber/xxx)
tarayıcı yerine direkt NaHaber app'inde açılsın.

4.1) Bu Apple Developer Portal'da ek bir kayıt gerektirmiyor — App ID'de
     "Associated Domains" zaten FAZ 1'de aktive ettik.
4.2) BANA NOT: kullanıcı sonra Xcode/Capacitor projesinde:
       applinks:www.nahaber.com
       applinks:nahaber.com
       webcredentials:www.nahaber.com
     domain'lerini ekleyecek + web sunucusunda
     https://www.nahaber.com/.well-known/apple-app-site-association
     JSON dosyası servisleyecek. Bu sunucu tarafı işi.

CHECKPOINT FAZ 4:
- Associated Domains capability aktif: ✓ (FAZ 1'de yapıldı)
- Web tarafı görev olarak not edildi

═══════════════════════════════════════════════════════════════
FAZ 5 — APP STORE CONNECT'TE UYGULAMAYI OLUŞTUR
═══════════════════════════════════════════════════════════════

5.1) https://appstoreconnect.apple.com/ adresine git. Login isterse
     DUR ve bana söyle.
5.2) Üstte "My Apps" tıkla.
5.3) Sol üstte "+" simgesine tıkla → "New App" seç.
5.4) Aşağıdaki formu doldur:
       - Platforms: [x] iOS  (sadece iOS, macOS/visionOS işaretleme)
       - Name: NaHaber
       - Primary Language: Turkish (Türkçe)
       - Bundle ID: dropdown'dan "NaHaber - com.nahaber.app" seç
       - SKU: nahaber-ios-2026   (iç referans, kullanıcı görmez)
       - User Access: Full Access
5.5) Create → uygulama kaydı oluşur.
5.6) Sol menüden "App Information" sayfası açılır. Şunları doldur:
       - Privacy Policy URL: https://www.nahaber.com/gizlilik
       - Marketing URL: https://www.nahaber.com
       - Support URL: https://www.nahaber.com/iletisim
       - Category Primary: News
       - Category Secondary: Magazines & Newspapers
       - Content Rights: "Contains, shows or accesses third-party
         content?" → YES (haber içeriği için)
5.7) Sol menüden "Pricing and Availability":
       - Price Schedule: Free (TRY)
       - Availability: All countries (veya en azından TR + AB + ABD)
       - Pre-order: Off
5.8) Sol menüden "App Privacy":
       - "Get Started" tıkla. Privacy questionnaire açılır.
       - Bana DUR ve sor: bu form 30+ soru içeren bir survey. Doğru
         cevap verilmezse Apple ileride app'i reddeder. Bu kısmı
         kullanıcı ile birlikte doldur veya draft olarak bırak.
5.9) Sol menüden "iOS App Version 1.0":
       - Bu kısımda screenshot + binary yükleme alanı var. ŞİMDİ
         BOŞ BIRAK. Sadece sayfanın hazır olduğunu doğrula.
       - "What's New in This Version": "İlk sürüm."
       - "Promotional Text": "NaHaber — anlık haberler artık cebinizde."
       - "Description": (yukarıdaki Türkçe description metnini yapıştır)
       - "Keywords": (yukarıdaki Türkçe keywords listesini yapıştır,
          virgülle ayrılmış 100 karakter limit)
       - "Support URL": https://www.nahaber.com/iletisim
       - "Marketing URL": https://www.nahaber.com
       - "Copyright": 2026 NaHaber

CHECKPOINT FAZ 5:
- App Store Connect app oluşturuldu: ✓
- App ID (rakam, üst URL'de görünür, ör. 1234567890): __________
- App Information dolduruldu: ✓
- App Privacy: TASLAK (kullanıcı tamamlayacak)
- iOS App Version 1.0 metadata dolduruldu, binary BEKLİYOR

═══════════════════════════════════════════════════════════════
FAZ 6 — AGE RATING & APP REVIEW INFORMATION
═══════════════════════════════════════════════════════════════

6.1) "App Information" → en altta "Age Rating" satırının yanındaki
     "Edit" butonuna bas.
6.2) Aşağıdaki soruları AŞAĞIDAKİ gibi cevapla (haber app için
     standart):
       - Cartoon or Fantasy Violence: None
       - Realistic Violence: Infrequent/Mild  (haber görüntüleri için)
       - Prolonged Graphic or Sadistic Realistic Violence: None
       - Profanity or Crude Humor: None
       - Sexual Content or Nudity: None
       - Graphic Sexual Content and Nudity: None
       - Horror/Fear Themes: None
       - Medical/Treatment Information: Infrequent/Mild (sağlık haberi)
       - Alcohol, Tobacco, or Drug Use or References: Infrequent/Mild
       - Mature/Suggestive Themes: None
       - Simulated Gambling: None
       - Contests: None
       - Unrestricted Web Access: NO  (in-app web view sınırlı)
       - Gambling: NO
6.3) Save. Sonuç: 12+ olmalı.
6.4) Sol menüden "App Review Information" (varsa) — bu kısımda
     Apple reviewer için iletişim bilgisi ve test hesabı istenir.
       - First Name: (kullanıcının adı)
       - Last Name: (kullanıcının soyadı)
       - Phone Number: (kullanıcı dolduracak)
       - Email: iletisim@nahaber.com
       - Sign-in required: NO (app login zorunlu değil)
       - Notes: "NaHaber web ve mobil için ücretsiz haber app'idir.
                Tüm içerik anonim erişimle görüntülenebilir. Capacitor
                hibrit uygulamadır, web altyapısı www.nahaber.com'dadır."

CHECKPOINT FAZ 6:
- Age rating: 12+
- App Review Information: ad/soyad/telefon BEKLİYOR (kullanıcı doldur)

═══════════════════════════════════════════════════════════════
FAZ 7 — APP-SPECIFIC SHARED SECRET (gelecekte IAP gerekirse)
═══════════════════════════════════════════════════════════════

NaHaber'de şu an in-app purchase yok ama ileride premium abonelik
gelirse hazır olalım.

7.1) Apps sayfasında > NaHaber app'ini aç > sol menüde "App Information"
     sayfasının en altına in.
7.2) Eğer "App-Specific Shared Secret" alanı görünüyorsa "Manage"
     tıkla, "Generate" et. Çıkan değeri sakla.
     (Eğer görünmüyorsa: bu sadece In-App Purchases yapılandırıldıktan
     sonra ortaya çıkar. ATLA.)

CHECKPOINT FAZ 7:
- Shared Secret: (üretildiyse) __________ / (yoksa) atlandı

═══════════════════════════════════════════════════════════════
FAZ 8 — TESTFLİGHT ÖN HAZIRLIĞI
═══════════════════════════════════════════════════════════════

Hedef: Build yüklendiğinde TestFlight'tan iç ekibe dağıtılabilsin.

8.1) Sol menüden "TestFlight" → "Internal Testing" altında "+" ile
     "NaHaber Internal Testers" adlı bir grup oluştur.
8.2) Grup test bilgileri:
       - Test Information sekmesi:
         - Beta App Description: "NaHaber Beta sürümü"
         - Email: iletisim@nahaber.com
         - Privacy Policy URL: https://www.nahaber.com/gizlilik
         - Feedback: iletisim@nahaber.com
8.3) Henüz tester ekleme; build yüklendiğinde kullanıcı ekleyecek.

CHECKPOINT FAZ 8:
- TestFlight Internal grubu: NaHaber Internal Testers
- Test Information dolduruldu

═══════════════════════════════════════════════════════════════
SON RAPOR
═══════════════════════════════════════════════════════════════

İŞ BİTTİĞİNDE BANA AŞAĞIDAKİ TABLOYU MARKDOWN OLARAK VER:

| Alan                          | Değer                                |
|-------------------------------|--------------------------------------|
| Team ID                       | XXXXXXXXXX                           |
| Bundle ID                     | com.nahaber.app                      |
| Service ID (Sign in Apple)    | com.nahaber.app.web                  |
| APNs Key ID                   | XXXXXXXXXX                           |
| APNs Auth Key dosyası         | ~/Downloads/nahaber-apple-setup/AuthKey_XXX.p8 |
| App Store Connect App ID      | XXXXXXXXXX (URL'den)                 |
| Age Rating                    | 12+                                  |
| Primary Category              | News                                 |
| Secondary Category            | Magazines & Newspapers               |
| Pricing                       | Free                                 |
| Privacy Policy URL            | https://www.nahaber.com/gizlilik     |
| Marketing URL                 | https://www.nahaber.com              |
| Support URL                   | https://www.nahaber.com/iletisim     |

VE KULLANICIYA SONRAKİ ADIMLAR LİSTESİ:

1. ~/Downloads/nahaber-apple-setup/AuthKey_XXX.p8 dosyasını ŞİFRELİ
   bir yedek konumuna (1Password, Bitwarden vault, encrypted disk) kopyala.
   Apple bu dosyayı bir daha indirmene izin VERMEZ.
2. OneSignal Dashboard → Settings → iOS Push → "p8 Key" girişine bu
   dosyanın içeriğini + Key ID + Team ID + Bundle ID gir.
3. Sign in with Apple domain verification dosyasını web sunucusunda
   www.nahaber.com/.well-known/apple-developer-domain-association.txt
   olarak yayınla, sonra Apple Developer'a dönüp "Verify" tıkla.
4. Capacitor entegrasyonu için artık hazırız: bundle id = com.nahaber.app,
   team id = <Team ID>.
5. App Privacy questionnaire ve App Review Information form'larını
   tamamlamadan submit edilemez — bunlar manuel.
6. Screenshot'lar üretildikten sonra Version 1.0 sayfasına yüklenir.

ÖNEMLİ:
- HİÇBİR yerde "Submit for Review" tıklamadın değil mi? KONTROL ET.
- Her FAZ'da aldığın ekran görüntüleri ~/Downloads/nahaber-apple-setup/
  altında olmalı, sırayla 01-..., 02-..., 03-... ile adlandır.

BİTİR.
```

---

## SONRAKİ ADIM (Apple kurulumu tamamlandıktan sonra)

Claude raporu verdiğinde, bana **`AuthKey_XXX.p8` dosyasının yolunu**, **Team ID**'yi
ve **Key ID**'yi söyle. Onlarla:

1. OneSignal iOS push konfigürasyonu tamamlanır
2. Capacitor projesi `capacitor.config.ts` içine `appId: "com.nahaber.app"` yazılır
3. iOS Xcode projesi generate edilir
4. Sign in with Apple `apple-developer-domain-association.txt` web tarafına eklenir
5. `.well-known/apple-app-site-association` JSON'u universal links için yayınlanır

Tüm bunlar tek sefer; ondan sonra her Xcode → Archive → Upload yeterli olur.

---

## GİZLİLİK NOTU

- `.p8` dosyası özel anahtardır. Public repo'ya commit ETME. `.gitignore`'a
  zaten `*.p8` ekleyeceğim (aşağıda).
- Team ID + Key ID + Bundle ID public bilgidir, repo'da olabilir.
- Apple ID parolası ve 2FA kodu sadece sende kalmalı — Claude bunları
  asla görmemeli, depolamamalı, log'lamamalı.
