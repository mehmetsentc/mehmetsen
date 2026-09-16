import { getRootCategoryId } from '@/constants/categoryTheme'

/** Presentation copy for desktop category heroes — not a ranking signal. */
export const DESKTOP_CATEGORY_SLOGANS: Record<string, string> = {
  gundem: 'Bugünün gündemi, yarının tarihi',
  siyaset: 'Kararlar, tartışmalar, sonuçlar',
  ekonomi: 'Piyasalar, yatırımlar, fırsatlar',
  dunya: 'Dünyayı anlamak, geleceği görmek',
  spor: 'Sahadan tüm gelişmeler',
  teknoloji: 'Bugünün teknolojisi, yarının dünyası',
  saglik: 'Sağlıklı bir gelecek için',
  kultur: 'Sanat, hayatı güzelleştirir',
  yasam: 'Daha iyi bir yaşam mümkün',
  egitim: 'Daha aydınlık yarınlar için',
  magazin: 'Eğlence dünyasından',
  bilim: 'Keşif, araştırma, merak',
  asayis: 'Üçüncü sayfa gelişmeleri',
  'kibris-haberleri': 'Kıbrıs’tan güncel haberler',
  turizm: 'Yollar, duraklar, keşifler',
  gezi: 'Görülecek yerler, anlatılacak hikâyeler',
  otomobil: 'Yollardan ve vitrinden',
  gastronomi: 'Sofra, lezzet, kültür',
  'oyun-espor': 'Oyun ve rekabet',
  'din-inanc': 'İnanç ve toplum',
  'cevre-iklim': 'Doğa ve iklim',
  tarih: 'Dünden bugüne',
  'yerel-haber': 'Şehrinizden haberler',
}

export function desktopCategorySlogan(categoryId: string): string {
  const root = getRootCategoryId(categoryId)
  return DESKTOP_CATEGORY_SLOGANS[root] ?? DESKTOP_CATEGORY_SLOGANS[categoryId] ?? 'Güncel haberler'
}

export const DESKTOP_CATEGORY_FEATURED_COUNT = 8
