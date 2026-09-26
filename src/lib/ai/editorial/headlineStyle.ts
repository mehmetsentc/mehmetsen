/**
 * NaHaber manşet dili — ulusal gazete (Sözcü vb.) merak + dürüstlük.
 * Ucuz "ŞOK" clickbait değil; haberi okutacak kanca.
 */

export const NAHABER_HEADLINE_STYLE = `MANŞET SÖZLEŞMESİ (profesyonel gazete — merak + dürüstlük):
- Başlık haberi bitirmez. Okuyucu başlıktan "ne oldu?"yu tam anlatamamalı.
- 4-9 kelime. Kişi, kurum, yer veya sayıdan birini tut; sonucu, listeyi ve nedeni spota bırak.
- Soru ve kısa ünlem serbest. Cevap gövdede. Nokta koyma.
- Üslup SES KARTINA uyar. Yorum, kaynakta duran gerilimin çerçevesidir; yeni olgu değildir.
- Tıklayınca AYNI olay çıksın. Kaynakta yoksa sır, gizli liste, niyet uydurma.
- "o marka / o isim" yalnızca kaynakta adı saklanan veya çoklu bir liste varsa.
- YASAK: ŞOK, SKANDAL, DEHŞET, KORKUNÇ, İNANILMAZ, büyük harf spam, hakaret, yalan vaat.
- "Son dakika" yalnızca gerçek acil gelişmede. Son dakika masası düz kısa olgu yazar; diğer masalar sonucu saklar.
İYİ: "O 21 marka listede"
İYİ: "Zidane'dan Türkiye planı"
İYİ: "THY'nin yeni tarifesi"
KÖTÜ: "Tarım Bakanlığı 21 gıda markasını denetim sonucu açıkladı ve vatandaşı uyardı"
KÖTÜ: "THY'de zam oranı netleşti" (sonucu söyledi)
KÖTÜ: "ŞOK! Markalar ifşa oldu"`.trim()

/** Sosyal paylaşım manşeti + özet — OG/story overlay ve feed caption. */
export const NAHABER_SOCIAL_SHARE_STYLE = `SOSYAL PAYLAŞIM (manşet + özet net ayrılsın):
- socialHeadline = görsel/story MANŞETİ: gazete kancası; hikâyeyi dökme; max 100 karakter; nokta yok
- socialStorySummary = PAYLAŞIM ÖZETİ (manşetin altı): 1-2 TAM cümle; kim/ne/nerede + etki; max 200
- socialCaption = feed AÇIKLAMASI: başlığı tekrarlama; arka plan + detay + etki; 400-700 karakter
- Push başlığı kısa kanca (max 60); push metni tek net cümle (max 120)
- Meta CTA YASAK: haberimizde, tıkla, devamı, işte detaylar
- YASAK: ŞOK, SKANDAL, DEHŞET, sahte vaat
- Görsel/video için ayrı alt + dosya adı üret; dosya adı kısa-slug + uzantı`.trim()
