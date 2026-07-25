/** Turkish Wordle-style engine — 5 letters, 6 guesses. */

export const WORD_LENGTH = 5
export const MAX_GUESSES = 6

export const TURKISH_LETTERS = [
  'A', 'B', 'C', 'Ç', 'D', 'E', 'F', 'G', 'Ğ', 'H',
  'I', 'İ', 'J', 'K', 'L', 'M', 'N', 'O', 'Ö', 'P',
  'R', 'S', 'Ş', 'T', 'U', 'Ü', 'V', 'Y', 'Z',
] as const

export type LetterState = 'correct' | 'present' | 'absent' | 'empty'

function normalizeTr(s: string): string {
  return s.trim().toLocaleUpperCase('tr-TR')
}

/** Curated 5-letter Turkish words. */
const RAW = [
  'HABER', 'KALEM', 'KITAP', 'SAYFA', 'BASIN', 'YAZAR', 'METIN',
  'GÜNEŞ', 'BULUT', 'DENİZ', 'ORMAN', 'ÇİÇEK', 'TOPRAK', 'NEHİR', 'ŞEHİR',
  'SOKAK', 'ARABA', 'UÇAK', 'EKMEK', 'SINIF', 'HASTA', 'BANKA', 'SEÇİM',
  'PARTİ', 'TAKIM', 'MÜZİK', 'ŞARKI', 'SAHNE', 'BEYAZ', 'SİYAH', 'YEŞİL',
  'KÖPEK', 'ARMUT', 'KİRAZ', 'MASAL', 'ZAMAN', 'DÜNYA',
  'RADYO', 'KALAN', 'GELEN', 'GİDEN', 'YAPAN', 'BAKAN', 'BÜYÜK', 'KÜÇÜK',
  'YAVAŞ', 'HIZLI', 'SICAK', 'SOĞUK', 'DOĞRU', 'GÜZEL', 'İNSAN', 'KADIN',
  'ERKEK', 'ÇOCUK', 'YEMEK', 'İÇMEK', 'OKUMA', 'YAZMA', 'SEVGİ',
  'HAYAL', 'BARIŞ', 'SAVAŞ', 'KURAL', 'YASAL', 'POSTA', 'KARGO',
  'BİLET', 'KAZAN', 'GÖLGE', 'AYLIK', 'GÜNDE', 'HAFTA', 'AYLAR',
  'BAHAR', 'YAZIN', 'KIŞIN', 'SABAH', 'AKŞAM', 'BUGÜN', 'YARIN',
  'ŞİMDİ', 'SONRA', 'ORADA', 'NASIL', 'NEDEN', 'NİÇİN', 'KİMSE',
  'BİRAZ', 'BELKİ', 'SELAM', 'SAĞLIK', 'BİLİM', 'SANAT', 'TARİH',
  'FİZİK', 'KİMYA', 'İZMİR', 'BURSA', 'ADANA', 'KONYA', 'AYDIN',
  'HATAY', 'KIBRIS', 'SAMSUN', 'MUĞLA', 'EDİRNE', 'SPORU',
  'KOŞMA', 'UYUMA',
]

export const VALID_GUESSES: string[] = Array.from(
  new Set(RAW.map(normalizeTr).filter((w) => w.length === WORD_LENGTH))
)

export const ANSWER_LIST = VALID_GUESSES

export function pickDailyAnswer(date = new Date()): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = Math.floor(d.getTime() / 86_400_000)
  return ANSWER_LIST[Math.abs(day) % ANSWER_LIST.length]!
}

export function pickRandomAnswer(): string {
  return ANSWER_LIST[Math.floor(Math.random() * ANSWER_LIST.length)]!
}

export function isValidGuess(word: string): boolean {
  const n = normalizeTr(word)
  return n.length === WORD_LENGTH && VALID_GUESSES.includes(n)
}

export function scoreGuess(guess: string, answer: string): LetterState[] {
  const g = normalizeTr(guess).split('')
  const a = normalizeTr(answer).split('')
  const result: LetterState[] = Array(WORD_LENGTH).fill('absent')
  const remaining: Record<string, number> = {}

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (g[i] === a[i]) result[i] = 'correct'
    else remaining[a[i]!] = (remaining[a[i]!] ?? 0) + 1
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === 'correct') continue
    const ch = g[i]!
    if ((remaining[ch] ?? 0) > 0) {
      result[i] = 'present'
      remaining[ch]! -= 1
    }
  }
  return result
}

export function normalizeWord(word: string): string {
  return normalizeTr(word)
}
