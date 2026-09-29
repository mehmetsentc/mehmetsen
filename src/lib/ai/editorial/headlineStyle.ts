/**
 * NaHaber manşet dili — çarpıcı olgu başlıkta, ucuz şok yok.
 * Okuyucu başlıktan ne olduğunu görür ve detayı okumak ister.
 */

export const NAHABER_HEADLINE_STYLE = `MANŞET SÖZLEŞMESİ (agresif gazete manşeti — çarpıcı olgu + dürüstlük):
- Başlık haberi saklamaz. Okuyucu başlıktan ne olduğunu görsün ve ayrıntıyı okumak istesin.
- EN ÇARPICI DOĞRULANMIŞ OLGUSU başlığa koy: ölü/yaralı sayısı, tutar, karar, isim, skor, el konulan mal, ceza, tarih. Varsa sayı şart.
- Jenerik ve üstü kapalı manşet YASAK. "Büyük kaza", "önemli gelişme", "dikkat çeken karar", "flaş iddia" olayı söylemez.
- Kaza, yangın, saldırı, deprem, operasyon: yer + sonuç aynı başlıkta. 5 kişi öldüyse "büyük kaza" yazma; "5 ölü" yaz.
- 6-12 kelime, maks 85 karakter. Kişi veya kurum + fiil + çarpıcı sonuç. Nokta koyma.
- Tıklayınca AYNI olay çıksın. Kaynakta yoksa sayı, sır, gizli liste, niyet UYDURMA.
- Üslup SES KARTINA uyar. Üstü kapalı manşet talimatı yürürlükten kalktı.
- YASAK: ŞOK, SKANDAL, DEHŞET, KORKUNÇ, İNANILMAZ, FLAŞ, büyük harf spam, hakaret, yalan vaat.
İYİ: "Ankara'da zincirleme kaza: 5 ölü"
İYİ: "Fon soruşturmasında 5 villaya el konuldu"
İYİ: "TCMB faizi yüzde 50'de sabit bıraktı"
KÖTÜ: "Büyük kaza" (5 ölü varken sayıyı sakladı)
KÖTÜ: "Ankara'da trafik alarmı"
KÖTÜ: "ŞOK! Korkunç kaza can aldı"`.trim()

/** Sosyal paylaşım manşeti + özet — OG/story overlay ve feed caption. */
export const NAHABER_SOCIAL_SHARE_STYLE = `SOSYAL PAYLAŞIM (manşet + özet net ayrılsın):
- socialHeadline = görsel/story MANŞETİ: çarpıcı olgu (sayı, isim, karar); kancayı saklama; max 100 karakter; nokta yok
- socialStorySummary = PAYLAŞIM ÖZETİ (manşetin altı): 1-2 TAM cümle; kim/ne/nerede + etki; max 200
- socialCaption = feed AÇIKLAMASI: başlığı tekrarlama; arka plan + detay + etki; 400-700 karakter
- Push başlığı kısa kanca (max 60) ama olayı söylesin; push metni tek net cümle (max 120)
- Meta CTA YASAK: haberimizde, tıkla, devamı, işte detaylar
- YASAK: ŞOK, SKANDAL, DEHŞET, sahte vaat
- Görsel/video için ayrı alt + dosya adı üret; dosya adı kısa-slug + uzantı`.trim()
