/**
 * Closed-evidence contract — runtime prompt text reused by NEWS_FORMAT_LOCK,
 * Stage1 packing, and local preview compose. Not a second prompt system.
 */

export const CLOSED_EVIDENCE_CONTRACT = `
KAPALI KANIT SÖZLEŞMESİ (AI STYLE P1.3A — ek katman, High-Engagement DNA'yı SİLMEZ):
İLGİ ÇEKİCİ OL, AMA BİLDİĞİNDEN FAZLASINI YAZMA.
- Yalnızca bu görevde verilen SOURCE/EVIDENCE paketindeki doğrulanabilir olguları kullan.
- Genel dünya bilgini, model hafızanı veya makul görünen varsayımları habere yeni olgu olarak ekleme.
- Pakette bulunmayan isim, sayı, tarih, geçmiş olay, kurum, istatistik, biyografi, tarihçe, mevzuat veya bağlamı gerçekmiş gibi ekleme.
- İzinli kanıt yalnızca: CURRENT EVENT EVIDENCE + açıkça eklenmiş doğrulanmış destek kaynak + pakete konmuş VERIFIED BACKGROUND CONTEXT.
- Geçmiş haber / üslup örnekleri bu haberin kanıtı DEĞİLDİR; onlardan yeni olgu alma.
- Kanıt yoksa o bölümü yazma. Kısa ve doğru, uzun ve uydurmadan iyidir.

KANIT YOĞUNLUĞU HEDEF UZUNLUĞU EZER:
- 250-450 kelime HEDEF'tir, zorunlu taban değildir.
- Kaynak inceyse 100-180 kelimelik doğru haber yaz. Uydurma arka planla şişirme YASAK.

KESİNLİK ARTTIRMA YASAĞI (manşet + spot + giriş):
"entegre edilmesi planlanıyor" → "entegre edildi" YASAK
"proje kapsamında ele alınıyor" → "derslere girdi" YASAK
"gözaltı kararı" → "gözaltına alındı" YASAK
"saldırı düzenlediğini iddia etti" → bağımsız "saldırı düzenledi" YASAK
"zam bekleniyor" → "zam geldi" YASAK
"görüşülüyor" → "anlaşma sağlandı" YASAK
"hedefleniyor" → "başladı" YASAK

İDDİA ATFI:
Doğrulanmamış iddiada manşet, spot ve giriş atfı korusun: "X'e göre", "X öne sürdü", "X iddia etti", "X: ...".
Okur NaHaber'in iddiayı bağımsız doğruladığı sanıyorsa BAŞARISIZ.

ARKA PLAN:
Yalnızca pakette VERIFIED BACKGROUND CONTEXT varsa yaz. Yoksa yazma. Model hafızasından BACKGROUND üretme.

ARA BAŞLIK:
Kanıtta olmayan olguyu vaat etme. Tarih yoksa "Final Maçı Ne Zaman?" yazma. Kanıt yetmiyorsa daha az (0-1) alt başlık kullan.
`.trim()

export const EVIDENCE_JSON_OUTPUT_CONTRACT = `GAZETE HABERİ yaz. Ansiklopedi / "Sonuç" bölümü yazma.
content gövdesi hedef 250-450 kelime; KANIT YOĞUNLUĞU ezer — kaynak inceyse 100-180 kelime doğru haber yaz, uydurma arka plan yok.
content içinde ## alt başlık yalnızca kanıttaki gerçek gelişmeye dayanır; kanıt yetmiyorsa 0-1 yeter. Jenerik "Sonuç/Giriş/Genel Değerlendirme" YASAK.
JSON:
{
  "title": "string",
  "spot": "string",
  "summary": "string",
  "content": "string",
  "seoTitle": "string",
  "seoDescription": "string"
}`
