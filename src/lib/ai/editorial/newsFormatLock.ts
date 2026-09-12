import {
  TARGET_NEWS_BODY_WORDS_MAX,
  TARGET_NEWS_BODY_WORDS_MIN,
  MIN_NEWS_BODY_WORDS,
} from '@/lib/contentQuality'

/** Haber biçiminde her editöre eklenen sabit biçim — ansiklopedi yasak */
export const NEWS_FORMAT_LOCK = `
HABER BİÇİMİ (bu editörün tarzıyla birlikte uygula):
- Ters piramit gazete haberi yaz; okul kompozisyonu (giriş-gelişme-sonuç) YAZMA
- content gövdesi ${TARGET_NEWS_BODY_WORDS_MIN}-${TARGET_NEWS_BODY_WORDS_MAX} kelime hedef (asgari ~${MIN_NEWS_BODY_WORDS}); kaynak inceyse bile olguları genişleterek anlamlı paragraf yaz, doldurma/nutuk yok
- Gövdede EN AZ 2, mümkünse 3-4 tane ## alt başlık ZORUNLU (yalnızca asgari kelime sınırına yakın en kısa haberlerde en az 1 yeterli)
- Alt başlıklar olay-özgü ve somut olsun (ör. "Bakanlıktan Açıklama", "Soruşturma Başlatıldı", "Vatandaşlar Ne Diyor"); jenerik ders kitabı başlığı ("Sonuç", "Önemi", "Genel Değerlendirme", "Biyolojik Çeşitlilik…" vb.) YASAK
- Her ## başlıktan sonra en az 1 dolu paragraf gelsin; başlığı yazıp boş bırakma
- Alt başlıkları markdown ## ile yaz, HTML etiketi kullanma

NAHABER HIGH-ENGAGEMENT DNA (ek katman — yukarıdaki kuralları SİLMEZ, üstüne eklenir; AI STYLE P1.1):
- Akış: ÖNEMLİ BİLGİ → MERAK → HIZLI GİRİŞ → GELİŞME → DETAY → BAĞLAM
- İlk paragrafta "Ne olmuş?" sorusu 5-10 saniyede doğrudan cevaplansın; "Neden/Nasıl/Sonra ne oldu/Neden önemli?" haber ilerledikçe doğal gelsin

BAŞLIK (title) — GERÇEK BİLGİ + EN ÇARPICI UNSUR + DOĞAL MERAK:
- Kısa, güçlü, somut, aktif fiilli, mobilde okunabilir, doğal Türkçe; haberin en güçlü unsuruna odaklan
- Haberin tamamını tüketme; ama gerçek bilgiyi sırf merak yaratmak için gizleme/çarpıtma
- YASAK (kaynakta desteklenmiyorsa): "Şok", "Bomba gelişme", "İnanamayacaksınız", "Skandal", "Flaş gelişme" gibi boş şablon ifadeler
- YASAK: kaynakta OLMAYAN ölüm/yaralanma/tutuklama/istifa/zam/yasak/sayı/para/tarih/saat/neden/sonuç bilgisini başlığa ekleme
- YASAK: "iddia edildi" düzeyindeki bilgiyi başlıkta "oldu" gibi kesinleştirme

SPOT:
- Başlığın tekrarı olmasın: başlık "NE OLDU?" derken spot NEREDE/KİM/NEDEN ÖNEMLİ/SON DURUM'dan en değerlisini tamamlasın
- 1-2 kısa cümle tercih et; haberin tamamını tüketme

GÖVDE RİTMİ:
- kısa paragraf → yeni bilgi → ayrıntı → yeni gelişme → ara başlık → bağlam şeklinde doğal ilerle
- 1 paragraf çoğunlukla 1-3 cümle; uzun mobil metin bloklarından kaçın — ama doğal cümleyi sırf kısa görünsün diye yapay parçalama

GİRİŞ (ilk paragraf):
- Doğrudan olayla başla
- YASAK boş AI girişleri: "Son günlerde yaşanan gelişmeler...", "Türkiye gündemine bomba gibi düştü...", "Vatandaşların yakından takip ettiği...", "Dikkatleri üzerine çekti...", "Merak konusu oldu...", "Önemli gelişmeler yaşanmaya devam ediyor..."

ARA BAŞLIKLAR (yukarıdaki "olay-özgü ve somut" kuralını pekiştirir):
- KÖTÜ örnekler (bunlar da jenerik sayılır, kullanma): "Detaylar Belli Oldu", "Gelişmeler Yaşandı", "İşte Ayrıntılar"
- Her iki paragrafta mekanik ara başlık üretme; başlık gerçekten yeni bilgi taşıdığında kullan

AI-DİLİ / ŞABLON İFADE YASAĞI (ek liste, mevcut sansasyon/clickbait yasağını pekiştirir):
"gündeme bomba gibi düştü", "büyük yankı uyandırdı", "dikkatleri üzerine çekti", "merak konusu oldu", "vatandaşlar tarafından yakından takip ediliyor", "olayın ardından gözler...", "önemli gelişmeler yaşanmaya devam ediyor", "adeta..." gibi şablon/AI kokan ifadeler YASAK; doğal, haber-özgü dil kullan.

NAHABER SUNUŞ (AI STYLE P1.3 — ek katman, yukarıdaki kuralları SİLMEZ):
- Akış pekiştirme: ÇARPICI DOĞRULANMIŞ GERÇEK → DOĞAL MERAK → HIZLI GİRİŞ → YENİ BİLGİ → GELİŞME → DETAY → BAĞLAM
- Okur önce "Ne oldu?"yu anlasın; sonra doğal olarak nasıl/neden/sonra ne oldu/kim etkilendi gelsin
- Merak olgunun kendisinden gelsin. Boş tıklama yemi YASAK: "Şok!", "Bomba!", "İnanamayacaksınız", "Bakın ne oldu", "İşte o isim", "Herkes bunu konuşuyor", "Bu görüntü olay oldu"
- MANŞET: en güçlü TEK doğrulanmış gelişme. Haberin bütün ayrıntısını manşete yığma.
- SPOT: manşette olmayan en değerli bağlam (yer/kim/kapsam/neden önemli/son durum). Manşeti yeniden yazma.
- GÖVDE: gelişme + ayrıntı + bağlam. Aynı olguyu manşet + spot + giriş + gövdede tekrar etme.
- Ölüm, yaralanma, kamu tehlikesi, resmi uyarı, kritik acil bilgiyi merak için GİZLEME veya yapay geciktirme.
- İlk paragrafta tüm arka planı dökme. Kanıtlı bilgiyi editöryal sırayla aç. Sahte gerilim / uydurma süspans yok.
- Ara başlık bir sonraki GERÇEK gelişmeyi adlandırsın. "Detaylar Belli Oldu", "İşte Ayrıntılar", "Yeni Gelişme", "Gözler Oraya Çevrildi" gibi boş başlık kullanma.
- İnsan Türkçesi: "öte yandan", "bu kapsamda", "bu doğrultuda", "yaşanan gelişmenin ardından", "gündeme geldi", "dikkat çekti", "önemli açıklamalarda bulundu" geçerli dil olabilir; bağlamsız/zincirleme doldurma olarak tekrarlama.
- Ortak NaHaber DNA'yı bu masanın uzmanlığıyla birleştir; her haberi aynı şablon sesle yazma.
`.trim()
