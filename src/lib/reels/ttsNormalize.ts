/**
 * REELS-10 — writes text the way a Turkish TTS voice should SAY it (pure, no I/O).
 *
 * Google / Gemini TTS read «19.20» as «on dokuz nokta yirmi», «%15» oddly, «Dr.» as
 * «de re», «CHP» as one word. Every reel / digest / preview voice goes through
 * `toSpokenTurkish` right before synthesis, so the on-screen text stays as written and
 * only the audio changes. Punctuation is kept or turned into commas so the voice pauses
 * where a newsreader would.
 */

const ONES = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz']
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan']
const SCALES: Array<[number, string]> = [
  [1e12, 'trilyon'],
  [1e9, 'milyar'],
  [1e6, 'milyon'],
  [1e3, 'bin'],
]

function under1000(n: number): string {
  const h = Math.floor(n / 100)
  const t = Math.floor((n % 100) / 10)
  const o = n % 10
  return [h ? (h === 1 ? 'yüz' : `${ONES[h]} yüz`) : '', TENS[t]!, ONES[o]!].filter(Boolean).join(' ')
}

/** 2026 → «iki bin yirmi altı», 1000 → «bin», 0 → «sıfır». */
export function numberToTurkish(n: number): string {
  if (!Number.isFinite(n)) return ''
  if (n < 0) return `eksi ${numberToTurkish(-n)}`
  n = Math.floor(n)
  if (n === 0) return 'sıfır'
  const parts: string[] = []
  let rest = n
  for (const [size, name] of SCALES) {
    const q = Math.floor(rest / size)
    if (q) {
      parts.push(size === 1e3 && q === 1 ? 'bin' : `${numberToTurkish(q)} ${name}`)
      rest %= size
    }
  }
  if (rest) parts.push(under1000(rest))
  return parts.join(' ')
}

/** Digits as written: «05» → «sıfır beş», «12» → «on iki». */
function digitsToTurkish(d: string): string {
  if (/^0\d/.test(d)) return [...d].map((c) => numberToTurkish(Number(c))).join(' ')
  return numberToTurkish(Number(d))
}

const ORDINAL_SUFFIX: Record<string, string> = {
  bir: 'birinci', iki: 'ikinci', üç: 'üçüncü', dört: 'dördüncü', beş: 'beşinci', altı: 'altıncı',
  yedi: 'yedinci', sekiz: 'sekizinci', dokuz: 'dokuzuncu', on: 'onuncu', yirmi: 'yirminci',
  otuz: 'otuzuncu', kırk: 'kırkıncı', elli: 'ellinci', altmış: 'altmışıncı', yetmiş: 'yetmişinci',
  seksen: 'sekseninci', doksan: 'doksanıncı', yüz: 'yüzüncü', bin: 'bininci', milyon: 'milyonuncu',
  milyar: 'milyarıncı',
}

/** 2 → «ikinci», 15 → «on beşinci». */
export function ordinalToTurkish(n: number): string {
  const w = numberToTurkish(n).split(' ')
  const last = w.pop()!
  return [...w, ORDINAL_SUFFIX[last] ?? `${last}inci`].join(' ')
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

/** Turkish letter names for spelled acronyms (newsreader style: Ce He Pe, Ka Pe Se Se). */
const LETTER: Record<string, string> = {
  A: 'A', B: 'Be', C: 'Ce', Ç: 'Çe', D: 'De', E: 'E', F: 'Fe', G: 'Ge', Ğ: 'Yumuşak ge', H: 'He',
  I: 'I', İ: 'İ', J: 'Je', K: 'Ka', L: 'Le', M: 'Me', N: 'Ne', O: 'O', Ö: 'Ö', P: 'Pe', Q: 'Kü',
  R: 'Re', S: 'Se', Ş: 'Şe', T: 'Te', U: 'U', Ü: 'Ü', V: 'Ve', W: 'Dabılyu', X: 'İks', Y: 'Ye', Z: 'Ze',
}
const spell = (w: string) => [...w].map((c) => LETTER[c] ?? c).join(' ')

/** Acronyms that are read as a word even though they could be spelled. */
const READ_AS_WORD = new Set([
  'NATO', 'UEFA', 'FIFA', 'TÜİK', 'ODTÜ', 'TOKİ', 'ASELSAN', 'HAVELSAN', 'ROKETSAN', 'FETÖ', 'DEAŞ', 'IŞİD',
  'MİT', 'İYİ', 'DEM', 'MEB', 'AFAD', 'NASA', 'OPEC', 'UNESCO', 'UNICEF', 'İSKİ', 'ASKİ', 'İZSU', 'BOTAŞ',
  'TEDAŞ', 'GESTAŞ', 'İETT', 'EGO', 'ÖSYM', 'TÜBİTAK', 'TOGG', 'AŞTİ', 'İŞKUR', 'KOSGEB', 'TÜSİAD', 'MÜSİAD',
  'DİSK', 'TÜRK-İŞ', 'SADAT',
])
/** Acronyms with vowels that newsreaders still spell. */
const SPELL_ALWAYS = new Set(['ABD', 'AB', 'AKP', 'İBB', 'AVM', 'AİHM', 'AİHS', 'ATM', 'GSYİH', 'KDV', 'ÖTV', 'İHA', 'SİHA', 'TCDD'])

export function acronym(w: string): string {
  if (READ_AS_WORD.has(w)) return w.charAt(0) + w.slice(1).toLocaleLowerCase('tr-TR')
  if (SPELL_ALWAYS.has(w) || !/[AEIİOÖUÜ]/.test(w)) return spell(w)
  return w.charAt(0) + w.slice(1).toLocaleLowerCase('tr-TR')
}

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bProf\.\s*Dr\./g, 'Profesör Doktor'],
  [/\bDoç\.\s*Dr\./g, 'Doçent Doktor'],
  [/\bDr\.\s*Öğr\.\s*Üyesi\b/g, 'Doktor Öğretim Üyesi'],
  [/\bProf\./g, 'Profesör'],
  [/\bDoç\./g, 'Doçent'],
  [/\bDr\./g, 'Doktor'],
  [/\bOp\./g, 'Operatör'],
  [/\bUzm\./g, 'Uzman'],
  [/\bAv\./g, 'Avukat'],
  [/\bOrg\./g, 'Orgeneral'],
  [/\bKoram\./g, 'Korgeneral'],
  [/\bT\.C\./g, 'Türkiye Cumhuriyeti'],
  [/\bvb\./g, 've benzeri'],
  [/\bvs\./g, 'vesaire'],
  [/\bMah\./g, 'Mahallesi'],
  [/\bCad\./g, 'Caddesi'],
  [/\bSok\./g, 'Sokağı'],
  [/\bBulv\./g, 'Bulvarı'],
  [/\bNo\s*:\s*/g, 'numara '],
  [/\bAK Parti\b/g, 'Ak Parti'],
]

const UNITS: Array<[RegExp, string]> = [
  [/^km²|^km2\b/, 'kilometrekare'],
  [/^m²|^m2\b/, 'metrekare'],
  [/^km\/s\b|^km\/sa\b/, 'kilometre hızla'],
  [/^km\b/, 'kilometre'],
  [/^kg\b/, 'kilogram'],
  [/^cm\b/, 'santimetre'],
  [/^mm\b/, 'milimetre'],
  [/^°C\b|^° C\b|^°/, 'derece'],
  [/^dk\b|^dak\.?/, 'dakika'],
  [/^sn\b/, 'saniye'],
  [/^TL\b|^₺/, 'lira'],
  [/^USD\b|^\$/, 'dolar'],
  [/^EUR\b|^€/, 'avro'],
  [/^ton\b/, 'ton'],
]

/** «19.20'de» → «on dokuz yirmide», «saat 09.00» → «saat dokuz». */
function sayTime(h: string, m: string): string {
  const hh = numberToTurkish(Number(h))
  if (m === '00') return hh
  return `${hh} ${m.startsWith('0') ? `sıfır ${numberToTurkish(Number(m))}` : numberToTurkish(Number(m))}`
}

/** Main entry: everything a TTS voice should hear instead of what is written. */
export function toSpokenTurkish(input: string): string {
  let t = ` ${input} `
  // 1. noise the voice must not read
  t = t
    .replace(/https?:\/\/\S+|www\.\S+/g, ' ')
    .replace(/[#@][\p{L}\d_]+/gu, ' ')
    .replace(/\p{Extended_Pictographic}|️/gu, ' ')
    .replace(/[“”"«»]/g, '')
    .replace(/[’`´]/g, "'")
  // 2. abbreviations
  for (const [re, w] of ABBREVIATIONS) t = t.replace(re, w)
  // 2b. initials «Y.D.», «A. Yılmaz», «M.K.A.»: the voice reads a lone capital + dot as a
  //     Roman ordinal (D. → «beş yüzüncü», C. → «yüzüncü»), so spell them as letters.
  t = t.replace(/(?<![\p{L}\d.])((?:[A-ZÇĞİÖŞÜ]\.\s?)+[A-ZÇĞİÖŞÜ]?)(?!\p{L})/gu, (m) => {
    const letters = m.replace(/[^A-ZÇĞİÖŞÜ]/g, '')
    return ` ${spell(letters)} `
  })
  // 3. dates 21.10.2026 / 21/10/2026 → 21 Ekim 2026
  t = t.replace(/(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)/g, (all, d, m, y) => {
    const mi = Number(m)
    return mi >= 1 && mi <= 12 && Number(d) >= 1 && Number(d) <= 31 ? `${Number(d)} ${MONTHS[mi - 1]} ${y}` : all
  })
  // 4. clock times 19.20 / 19:20 (+ suffix) — two-digit minutes, hour ≤ 24
  t = t.replace(/(?<![\d.,])([01]?\d|2[0-4])[.:]([0-5]\d)(?!\d)(?![.,]\d)(?:'(\p{L}+))?/gu, (_a, h, m, suf) => {
    return sayTime(h, m) + (suf ?? '')
  })
  // 5. percent: %15 / %3,5 / % 15 → yüzde ...
  t = t.replace(/%\s?(\d+(?:,\d+)?)(?:'(\p{L}+))?/gu, (_a, n, suf) => `yüzde ${n}${suf ? `'${suf}` : ''}`)
  // 6. scores / ranges 2-1, 10 - 15 → «2 1» (newsreader reads scores as two numbers)
  t = t.replace(/(?<![\d.,])(\d{1,3})\s?[-–]\s?(\d{1,3})(?!\d)(?![.,]\d)/g, '$1 $2')
  // 7. ordinals: «2. lig», «3. sırada», «15'inci»
  t = t.replace(/(?<![\d.,])(\d{1,4})\.\s+(?=(?:\p{Ll}|Lig\b|Dünya\b|Kat\b|Ordu\b|Bölge\b|Etap\b|Tur\b))/gu, (_a, n) => `${ordinalToTurkish(Number(n))} `)
  t = t.replace(/(?<![\d.,])(\d+)'(?:inci|ıncı|uncu|üncü|nci|ncı|ncu|ncü)\b/gu, (_a, n) => ordinalToTurkish(Number(n)))
  // 8. numbers (thousands with dots, decimals with comma) + unit + optional suffix
  t = t.replace(
    /(?<![\p{L}\d])(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(?:'(\p{L}+))?(\s?)((?:km²|km2|m²|m2|km\/sa|km\/s|km|kg|cm|mm|°\s?C|°|dk|dak\.?|sn|TL|₺|USD|EUR|\$|€|ton)(?![\p{L}]))?(?:'(\p{L}+))?/gu,
    (_a, int: string, dec: string | undefined, suf: string | undefined, sp: string, unit: string | undefined, usuf: string | undefined) => {
      let w = digitsToTurkish(int.replace(/\./g, ''))
      if (dec) w += ` virgül ${digitsToTurkish(dec)}`
      if (suf) w += suf
      if (unit) {
        const u = UNITS.find(([re]) => re.test(unit))
        return `${w} ${u ? u[1] : unit}${usuf ?? ''}`
      }
      return `${w}${sp}`
    },
  )
  // currency written before the number: $15, €3 → handled above only after; fix leftovers
  t = t.replace(/[$€₺]\s?(?=\p{L})/gu, (c) => (c.trim() === '$' ? 'dolar ' : c.trim() === '€' ? 'avro ' : 'lira '))
  // 9. acronyms (2+ capitals, incl. Turkish letters)
  t = t.replace(/(?<!\p{L})([A-ZÇĞİÖŞÜ]{2,}(?:-[A-ZÇĞİÖŞÜ]{2,})?)(?=('\p{L}+)?(?!\p{L}))/gu, (w) =>
    w === 'TL' ? 'lira' : acronym(w),
  )
  // apostrophe before a suffix is not spoken: «Çanakkale'de» fine for TTS, «Ce He Pe'nin» → «Ce He Pe'nin»
  // 10. symbols and pauses
  t = t
    .replace(/\s&\s/g, ' ve ')
    .replace(/\s\+\s/g, ' artı ')
    .replace(/(\p{L})\s?\/\s?(\p{L})/gu, '$1, $2')
    .replace(/\s*[()[\]]\s*/g, ', ')
    .replace(/\s*;\s*/g, ', ')
    .replace(/\s*[–—]\s*/g, ', ')
    .replace(/\.{3,}|…/g, '…')
    .replace(/\s+([,.!?…:])/g, '$1')
    .replace(/,\s*,+/g, ',')
    .replace(/([,.!?…:])(?=\p{L})/gu, '$1 ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^,\s*/, '')
  if (t && !/[.!?…]$/.test(t)) t += '.'
  return t
}
