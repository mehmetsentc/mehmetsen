export type HangmanCategory = 'genel' | 'haber' | 'spor' | 'sehir'

export type HangmanPuzzle = {
  word: string
  category: HangmanCategory
  hint: string
}

type PuzzleSeed = HangmanPuzzle & { level: 1 | 2 | 3 }

const PUZZLES: PuzzleSeed[] = [
  { word: 'HABER', category: 'haber', hint: 'Günün olayları', level: 1 },
  { word: 'BASIN', category: 'haber', hint: 'Medya sektörü', level: 1 },
  { word: 'SPOR', category: 'spor', hint: 'Müsabaka dünyası', level: 1 },
  { word: 'GOL', category: 'spor', hint: 'Futbolda sayı', level: 1 },
  { word: 'ANKARA', category: 'sehir', hint: 'Başkent', level: 1 },
  { word: 'BURSA', category: 'sehir', hint: 'Yeşil şehir', level: 1 },
  { word: 'İZMİR', category: 'sehir', hint: 'Ege’nin incisi', level: 1 },
  { word: 'TARİH', category: 'genel', hint: 'Geçmiş olaylar', level: 1 },
  { word: 'OKUL', category: 'genel', hint: 'Eğitim yeri', level: 1 },
  { word: 'SAĞLIK', category: 'genel', hint: 'Hastane ve hekim', level: 1 },
  { word: 'GAZETE', category: 'haber', hint: 'Basılı haber kaynağı', level: 2 },
  { word: 'MANŞET', category: 'haber', hint: 'Birinci sayfa başlığı', level: 2 },
  { word: 'EDİTÖR', category: 'haber', hint: 'Haberleri düzenleyen', level: 2 },
  { word: 'FUTBOL', category: 'spor', hint: 'En popüler top sporu', level: 2 },
  { word: 'ŞAMPİYON', category: 'spor', hint: 'Birinci olan', level: 2 },
  { word: 'ANTALYA', category: 'sehir', hint: 'Turizm başkenti', level: 2 },
  { word: 'KIBRIS', category: 'sehir', hint: 'Ada', level: 2 },
  { word: 'SAMSUN', category: 'sehir', hint: 'Karadeniz kenti', level: 2 },
  { word: 'EĞİTİM', category: 'genel', hint: 'Okul ve öğrenme', level: 2 },
  { word: 'ULAŞIM', category: 'genel', hint: 'Yol ve araçlar', level: 2 },
  { word: 'EKONOMİ', category: 'genel', hint: 'Para ve piyasalar', level: 2 },
  { word: 'KÜLTÜR', category: 'genel', hint: 'Sanat ve gelenek', level: 2 },
  { word: 'RÖPORTAJ', category: 'haber', hint: 'Soru-cevaplı haber', level: 3 },
  { word: 'KÖŞEYAZISI', category: 'haber', hint: 'Yorum yazısı', level: 3 },
  { word: 'BASKETBOL', category: 'spor', hint: 'Potaya sayı', level: 3 },
  { word: 'VOLEYBOL', category: 'spor', hint: 'File üstü spor', level: 3 },
  { word: 'OLİMPİYAT', category: 'spor', hint: 'Dünya spor şenliği', level: 3 },
  { word: 'İSTANBUL', category: 'sehir', hint: 'Boğazın şehri', level: 3 },
  { word: 'GAZİANTEP', category: 'sehir', hint: 'Güneydoğu kenti', level: 3 },
  { word: 'DEMOKRASİ', category: 'genel', hint: 'Halkın yönetimi', level: 3 },
  { word: 'CUMHURİYET', category: 'genel', hint: '29 Ekim', level: 3 },
  { word: 'TEKNOLOJİ', category: 'genel', hint: 'Dijital dünya', level: 3 },
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

export function pickPuzzle(
  category?: HangmanCategory | 'hepsi',
  level: 1 | 2 | 3 = 1
): HangmanPuzzle {
  let pool = PUZZLES.filter((p) => p.level === level)
  if (category && category !== 'hepsi') {
    const filtered = pool.filter((p) => p.category === category)
    if (filtered.length > 0) pool = filtered
  }
  if (pool.length === 0) pool = PUZZLES.filter((p) => p.level === level)
  if (pool.length === 0) pool = PUZZLES
  const raw = pool[Math.floor(Math.random() * pool.length)]!
  return {
    word: normalizeWord(raw.word),
    category: raw.category,
    hint: raw.hint,
  }
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
