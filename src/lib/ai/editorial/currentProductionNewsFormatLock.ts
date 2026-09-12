/**
 * Frozen snapshot of production NEWS_FORMAT_LOCK at origin target 95fe0a4
 * (pre–High-Engagement DNA). Preview/A-B only — never used by buildEditorPrompt().
 */
import {
  TARGET_NEWS_BODY_WORDS_MAX,
  TARGET_NEWS_BODY_WORDS_MIN,
  MIN_NEWS_BODY_WORDS,
} from '@/lib/contentQuality'

export const CURRENT_PRODUCTION_NEWS_FORMAT_LOCK = `
HABER BİÇİMİ (bu editörün tarzıyla birlikte uygula):
- Ters piramit gazete haberi yaz; okul kompozisyonu (giriş-gelişme-sonuç) YAZMA
- content gövdesi ${TARGET_NEWS_BODY_WORDS_MIN}-${TARGET_NEWS_BODY_WORDS_MAX} kelime hedef (asgari ~${MIN_NEWS_BODY_WORDS}); kaynak inceyse bile olguları genişleterek anlamlı paragraf yaz, doldurma/nutuk yok
- Gövdede EN AZ 2, mümkünse 3-4 tane ## alt başlık ZORUNLU (yalnızca asgari kelime sınırına yakın en kısa haberlerde en az 1 yeterli)
- Alt başlıklar olay-özgü ve somut olsun (ör. "Bakanlıktan Açıklama", "Soruşturma Başlatıldı", "Vatandaşlar Ne Diyor"); jenerik ders kitabı başlığı ("Sonuç", "Önemi", "Genel Değerlendirme", "Biyolojik Çeşitlilik…" vb.) YASAK
- Her ## başlıktan sonra en az 1 dolu paragraf gelsin; başlığı yazıp boş bırakma
- Alt başlıkları markdown ## ile yaz, HTML etiketi kullanma
`.trim()
