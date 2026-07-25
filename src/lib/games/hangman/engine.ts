export type HangmanCategory = 'genel' | 'haber' | 'spor' | 'sehir'

export type HangmanPuzzle = {
  word: string
  category: HangmanCategory
  hint: string
}

const PUZZLES: HangmanPuzzle[] = [
  { word: 'GAZETE', category: 'haber', hint: 'Basılı haber kaynağı' },
  { word: 'MANŞET', category: 'haber', hint: 'Birinci sayfa başlığı' },
  { word: 'EDİTÖR', category: 'haber', hint: 'Haberleri düzenleyen kişi' },
  { word: 'RÖPORTAJ', category: 'haber', hint: 'Soru-cevaplı haber' },
  { word: 'HABER', category: 'haber', hint: 'Günün olayları' },
  { word: 'BASIN', category: 'haber', hint: 'Medya sektörü' },
  { word: 'FUTBOL', category: 'spor', hint: 'En popüler top sporu' },
  { word: 'BASKETBOL', category: 'spor', hint: 'Potaya sayı' },
  { word: 'VOLEYBOL', category: 'spor', hint: 'File üstü spor' },
  { word: 'OLİMPİYAT', category: 'spor', hint: 'Dünya spor şenliği' },
  { word: 'ŞAMPİYON', category: 'spor', hint: 'Birinci olan' },
  { word: 'ANKARA', category: 'sehir', hint: 'Başkent' },
  { word: 'İSTANBUL', category: 'sehir', hint: 'Boğazın şehri' },
  { word: 'İZMİR', category: 'sehir', hint: 'Ege’nin incisi' },
  { word: 'BURSA', category: 'sehir', hint: 'Yeşil şehir' },
  { word: 'ANTALYA', category: 'sehir', hint: 'Turizm başkenti' },
  { word: 'KIBRIS', category: 'sehir', hint: 'Ada' },
  { word: 'DEMOKRASİ', category: 'genel', hint: 'Halkın yönetimi' },
  { word: 'CUMHURİYET', category: 'genel', hint: '29 Ekim' },
  { word: 'EĞİTİM', category: 'genel', hint: 'Okul ve öğrenme' },
  { word: 'SAĞLIK', category: 'genel', hint: 'Hastane ve hekim' },
  { word: 'EKONOMİ', category: 'genel', hint: 'Para ve piyasalar' },
  { word: 'TEKNOLOJİ', category: 'genel', hint: 'Dijital dünya' },
  { word: 'ULAŞIM', category: 'genel', hint: 'Yol ve araçlar' },
  { word: 'KÜLTÜR', category: 'genel', hint: 'Sanat ve gelenek' },
  { word: 'TARİH', category: 'genel', hint: 'Geçmiş olaylar' },
]

export const MAX_WRONG = 6

export const CATEGORY_LABEL: Record<HangmanCategory, string> = {
  genel: 'Genel',
  haber: 'Haber',
  spor: 'Spor',
  sehir: 'Şehir',
}

function normalizeWord(word: string): string {
  return word
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replace(/\s+/g, '')
    .replace(/[^A-ZÇĞİÖŞÜ]/gu, '')
}

export function pickPuzzle(category?: HangmanCategory | 'hepsi'): HangmanPuzzle {
  const pool =
    !category || category === 'hepsi'
      ? PUZZLES
      : PUZZLES.filter((p) => p.category === category)
  const src = pool.length > 0 ? pool : PUZZLES
  const raw = src[Math.floor(Math.random() * src.length)]!
  return { ...raw, word: normalizeWord(raw.word) }
}

export function revealMask(word: string, guessed: Set<string>): string[] {
  return word.split('').map((ch) => (guessed.has(ch) ? ch : '_'))
}

export function isWon(word: string, guessed: Set<string>): boolean {
  return word.split('').every((ch) => guessed.has(ch))
}

export function isLost(wrongCount: number): boolean {
  return wrongCount >= MAX_WRONG
}

export function countWrong(word: string, guessed: Set<string>): number {
  let n = 0
  for (const ch of guessed) {
    if (!word.includes(ch)) n += 1
  }
  return n
}
