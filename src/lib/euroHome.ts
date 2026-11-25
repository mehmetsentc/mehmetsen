/**
 * EURO-HOME — masaüstü ana sayfanın Euronews düzeni açık mı.
 * Varsayılan açık; `?eski=1` eski gazete düzenini gösterir (karşılaştırma / geri dönüş).
 * Mobil hiç etkilenmez (yalnız lg ve üstü masaüstü bileşenleri okur).
 */
export function isEuroHomeEnabled(search: string | null | undefined): boolean {
  const q = new URLSearchParams(search ?? '')
  return q.get('eski') !== '1'
}
