import { DEATH_LANGUAGE_RULE, neutralizeSocialText } from '@/lib/social/sensitiveNews'

/**
 * NaHaber manşet dili — çarpıcı olgu başlıkta, ucuz şok yok.
 * Okuyucu başlıktan ne olduğunu görür ve detayı okumak ister.
 */

export const NAHABER_HEADLINE_STYLE = `MANŞET SÖZLEŞMESİ (agresif gazete manşeti — çarpıcı olgu + dürüstlük):
- Başlık haberi saklamaz. Okuyucu başlıktan ne olduğunu görsün ve ayrıntıyı okumak istesin.
- Haberin EN YENİ ve EN ÖNEMLİ DOĞRULANMIŞ OLGUSUNU (bugün olanı) başlığa koy; en çarpıcı olgu bu ise o: hayatını kaybeden/yaralı sayısı, tutar, karar, isim, skor, el konulan mal, ceza, tarih. Varsa sayı şart.
- TAKİP HABERİ: Olay daha önce yaşandıysa manşet YENİ GELİŞMEYİ söyler (tutuklama, rapor, karar, açıklama). İlk günün can kaybı/yaralı sayısını ve "çarpıştı / hayatını kaybetti" olgusunu manşette tekrar etme.
- TARAFSIZ: Taraf tutan sıfat, yorum, suçlama yok; iddiayı sahibine atfet ("…iddia edildi", "…açıkladı").
- Jenerik ve üstü kapalı manşet YASAK. "Büyük kaza", "önemli gelişme", "dikkat çeken karar", "flaş iddia" olayı söylemez.
- Kaza, yangın, saldırı, deprem, operasyon: yer + sonuç aynı başlıkta. 5 kişi hayatını kaybettiyse "büyük kaza" yazma; "5 kişi hayatını kaybetti" yaz.
- ÖLÜM DİLİ: ${DEATH_LANGUAGE_RULE} Yalnızca kaynakta tırnak içindeki doğrudan alıntı aynen kalır.
- 6-12 kelime, maks 85 karakter. Kişi veya kurum + fiil + çarpıcı sonuç. Nokta koyma.
- Tıklayınca AYNI olay çıksın. Kaynakta yoksa sayı, sır, gizli liste, niyet UYDURMA.
- Üslup SES KARTINA uyar. Üstü kapalı manşet talimatı yürürlükten kalktı.
- YASAK: ŞOK, SKANDAL, DEHŞET, KORKUNÇ, İNANILMAZ, FLAŞ, büyük harf spam, hakaret, yalan vaat.
İYİ: "Ankara'da zincirleme kaza: 5 kişi hayatını kaybetti"
İYİ: "Fon soruşturmasında 5 villaya el konuldu"
İYİ: "TCMB faizi yüzde 50'de sabit bıraktı"
KÖTÜ: "Büyük kaza" (5 kişi hayatını kaybetmişken sayıyı sakladı)
KÖTÜ: "Karaman'da tırla çarpışan motokurye öldü" → İYİ: "Karaman'da tırla çarpışan motokurye hayatını kaybetti"
KÖTÜ: "Ankara'da trafik alarmı"
KÖTÜ: "ŞOK! Korkunç kaza can aldı"
İYİ (takip): "Küçükçekmece'deki kazada otomobil sürücüsü tutuklandı"
KÖTÜ (takip): "Küçükçekmece'de motosiklet otomobille çarpıştı: 21 yaşındaki sürücü hayatını kaybetti" (10 gün önceki olay yeni gibi)`.trim()

/**
 * Yapay zekânın yazdığı başlık / spot / özet için son, kurala bağlı düzeltme (talimata rağmen
 * "öldü" yazarsa). Metin gövdesine uygulanmaz: tırnaklı doğrudan alıntılar değiştirilmemeli.
 */
export function neutralNewsLine(s: string): string {
  return s ? neutralizeSocialText(s) : s
}

/** Sosyal paylaşım manşeti + özet — OG/story overlay ve feed caption. */
export const NAHABER_SOCIAL_SHARE_STYLE = `SOSYAL PAYLAŞIM (manşet + özet net ayrılsın):
- socialHeadline = görsel/story MANŞETİ: çarpıcı olgu (sayı, isim, karar); kancayı saklama; max 100 karakter; nokta yok
- socialStorySummary = PAYLAŞIM ÖZETİ (manşetin altı): 1-2 TAM cümle; kim/ne/nerede + etki; max 200
- socialCaption = feed AÇIKLAMASI: başlığı tekrarlama; arka plan + detay + etki; 400-700 karakter
- Push başlığı kısa kanca (max 60) ama olayı söylesin; push metni tek net cümle (max 120)
- Meta CTA YASAK: haberimizde, tıkla, devamı, işte detaylar
- YASAK: ŞOK, SKANDAL, DEHŞET, sahte vaat
- Görsel/video için ayrı alt + dosya adı üret; dosya adı kısa-slug + uzantı`.trim()
