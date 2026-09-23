/**
 * NaHaber manşet dili — ulusal gazete (Sözcü vb.) merak + dürüstlük.
 * Ucuz "ŞOK" clickbait değil; haberi okutacak kanca.
 */

export const NAHABER_HEADLINE_STYLE = `MANŞET (ulusal gazete tarzı — merak + dürüstlük):
- Manşet haberin tamamını dökmesin; okuyucuyu spot ve gövdeye çeksin
- Somut kanca koy: kişi, kurum, yer veya çarpıcı sayı — sonra bir pay bırak (neden / nasıl / kim / hangi liste)
- Aktif, gazete fiili: açıkladı, ifşa etti, yakalandı, rest çekti, uyarı, plan, karar
- 50-70 karakter; yalnızca ilk harf büyük; nokta veya soru ile bitirme
- Tıklayınca AYNI olay çıksın; kaynakta yoksa "o sır / gizli gerçek" uydurma
- "o marka / o isim / o karar" yalnızca kaynakta gerçekten çoklu veya henüz adı sayılmayan bir liste varsa
- YASAK: ŞOK, SKANDAL, DEHŞET, KORKUNÇ, İNANILMAZ, "bunu görünce", büyük harf spam, yalan vaat
- "Son dakika" yalnızca gerçek acil gelişmede
İYİ: "Bakanlık o markaları tek tek ifşa etti"
İYİ: "Zidane'dan Türkiye planı"
İYİ: "THY'de zam oranı netleşti"
KÖTÜ: "Tarım Bakanlığı 21 gıda markasını denetim sonucu açıkladı ve vatandaşı uyardı" (her şeyi döktü)
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
