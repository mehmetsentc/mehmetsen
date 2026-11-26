/**
 * REELS-10 — writes text the way a Turkish TTS voice should SAY it (pure, no I/O).
 *
 * Google / Gemini TTS read «19.20» as «on dokuz nokta yirmi», «%15» oddly, «Dr.» as
 * «de re», «CHP» as one word. Every reel / digest / preview voice goes through
 * `toSpokenTurkish` right before synthesis, so the on-screen text stays as written and
 * only the audio changes. Punctuation is kept or turned into commas so the voice pauses
 * where a newsreader would.
 */

import { neutralizeSocialText } from '@/lib/social/sensitiveNews'

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

/**
 * Yabancı kuruluş kısaltmaları: Türk spikerler bunları İngilizce harf adlarıyla okur
 * («Bi Bi Si», «Si En En»). Türkçe ekler de bu okunuşa göre yazılır («BBC'nin», «CNN'e»),
 * bu yüzden Türkçe harf adı («Be Be Ce», «Ce Ne Ne») hem yanlış hem ekle uyumsuz duyulur.
 */
const FOREIGN_ACRONYMS: Record<string, string> = {
  BBC: 'Bi Bi Si', CNN: 'Si En En', CNBC: 'Si En Bi Si', NBC: 'En Bi Si', CBS: 'Si Bi Es', ABC: 'Ey Bi Si',
  MSNBC: 'Em Es En Bi Si', HBO: 'Eyç Bi O', FBI: 'Ef Bi Ay', CIA: 'Si Ay Ey', NSA: 'En Es Ey',
  NBA: 'En Bi Ey', NFL: 'En Ef El', NHL: 'En Eyç El', UFC: 'Yu Ef Si', MLS: 'Em El Es', WWE: 'Dabılyu Dabılyu İ',
  NYT: 'Nyu York Tayms', NPR: 'En Pi Ar', ESPN: 'İ Es Pi En', UCLA: 'Yu Si El Ey',
  NYPD: 'En Way Pi Di', BBCNEWS: 'Bi Bi Si Nyuz', CEO: 'Si İ O', SUV: 'Es Yu Vi',
}

export function acronym(w: string): string {
  const foreign = FOREIGN_ACRONYMS[w]
  if (foreign) return foreign
  if (READ_AS_WORD.has(w)) return w.charAt(0) + w.slice(1).toLocaleLowerCase('tr-TR')
  if (SPELL_ALWAYS.has(w) || !/[AEIİOÖUÜ]/.test(w)) return spell(w)
  return w.charAt(0) + w.slice(1).toLocaleLowerCase('tr-TR')
}

/** Sık geçen yabancı yer / kurum adlarının Türkçe okunuşu (ekran yazısı aynı kalır). */
const FOREIGN_NAME_LIST: Array<[string, string]> = [
  ['Phu Quoc', 'Fu Kuok'], ['Ho Chi Minh', 'Ho Çi Min'], ['Hanoi', 'Hanoy'],
  ['Phuket', 'Puket'], ['Phnom Penh', 'Pınom Pen'], ['Thailand', 'Tayland'], ['Shanghai', 'Şanghay'],
  ['Washington', 'Vaşington'], ['New York', 'Nyu York'], ['New Jersey', 'Nyu Cörsi'], ['Chicago', 'Şikago'],
  ['Los Angeles', 'Los Ancelıs'], ['San Francisco', 'San Fransisko'], ['Silicon Valley', 'Silikon Vadisi'],
  ['Wall Street', 'Vol Strit'], ['White House', 'Vayt Haus'], ['Downing Street', 'Dauning Strit'],
  ['Manchester', 'Mançester'], ['Chelsea', 'Çelsi'], ['Liverpool', 'Liverpul'], ['Tottenham', 'Totınım'],
  ['Champions League', 'Şampiyonlar Ligi'], ['Reuters', 'Roytırs'], ['Bloomberg', 'Blumberg'],
  ['The Guardian', 'Dı Gardiın'], ['Guardian', 'Gardiın'], ['Washington Post', 'Vaşington Post'],
  ['Wall Street Journal', 'Vol Strit Curnıl'], ['Financial Times', 'Faynenşıl Tayms'], ['Times', 'Tayms'],
  ['Deutsche Welle', 'Doyçe Velle'], ['Al Jazeera', 'El Cezire'], ['Euronews', 'Yuronyuz'],
  ['Associated Press', 'Asoşieytıd Pres'], ['Sky News', 'Skay Nyuz'], ['Fox News', 'Foks Nyuz'],
]
const FOREIGN_NAMES: Array<[RegExp, string]> = FOREIGN_NAME_LIST
  .sort((a, b) => b[0].length - a[0].length)
  .map(([w, say]) => [new RegExp(`(?<![\\p{L}])${w.replace(/ /g, '\\s+')}(?![\\p{L}])`, 'gu'), say])

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
/** Yabancı ad / kısaltma → Türkçe harflerle okunuş (yapay zekâdan gelir; doğrulanmış). */
export type SpokenLexicon = Record<string, string>

const SPOKEN_RE = /^[A-Za-zÇĞİÖŞÜçğıöşüâîû' -]+$/u
const TR_LOCAL_ACRONYM = /^[A-ZÇĞİÖŞÜ]{2,}$/u
/** Türkiye kısaltmaları: yapay zekâ yanlışlıkla İngilizce okunuş verse de dokunulmaz. */
const TR_ACRONYMS = new Set([
  'CHP', 'AKP', 'MHP', 'HDP', 'DEM', 'İYİ', 'TBMM', 'TSK', 'THY', 'TFF', 'TRT', 'AA', 'DHA', 'İHA', 'YSK', 'HSK', 'AYM',
  'SGK', 'BDDK', 'SPK', 'EPDK', 'RTÜK', 'TCMB', 'MEB', 'YÖK', 'KKTC', 'PKK', 'PYD', 'YPG', 'PTT', 'MGK', 'BM', 'AP',
  'TC', 'KYK', 'MSB', 'EGM', 'JGK', 'DSİ', 'TEİAŞ', 'TPAO', 'TÜPRAŞ', 'BİST', 'TOBB', 'TESK', 'KPSS', 'YKS', 'LGS',
  'ALES', 'TUS', 'ÖSYM', 'SSK', 'BAĞKUR', 'MASAK', 'HSYK', 'CMK', 'TCK', 'İİK', 'ÇAYKUR', 'TMO', 'TİGEM', 'ATV', 'NTV',
  'TV', 'HD', 'GS', 'FB', 'BJK', 'TS', 'MKE', 'TAI', 'TUSAŞ', 'ASELSAN', 'İGA', 'DHMİ', 'TCDD', 'TMSF', 'GSYH', 'BES',
])

/**
 * Yapay zekânın verdiği sözlüğü süzer: anahtar metinde birebir geçmeli, büyük harfle
 * başlamalı (özel ad / kısaltma); Türkiye kısaltmaları (CHP, MİT…) ve Türkçe sözcükler
 * dokunulmaz; okunuş yalnızca harf, boşluk, kesme ve tire içerir, makul uzunluktadır.
 */
export function sanitizeLexicon(raw: unknown, text: string): SpokenLexicon {
  const out: SpokenLexicon = {}
  const items = Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : []
  for (const it of items.slice(0, 30)) {
    const w = typeof (it as { w?: unknown })?.w === 'string' ? (it as { w: string }).w.trim() : ''
    const say = typeof (it as { s?: unknown })?.s === 'string' ? (it as { s: string }).s.replace(/\s+/g, ' ').trim() : ''
    if (w.length < 2 || w.length > 40 || !say || say === w) continue
    if (!/^\p{Lu}/u.test(w) || !SPOKEN_RE.test(say) || say.length > Math.max(14, w.length * 4)) continue
    if (READ_AS_WORD.has(w) || SPELL_ALWAYS.has(w) || TR_ACRONYMS.has(w.replace(/'.*$/, ''))) continue
    if (TR_LOCAL_ACRONYM.test(w) && /[ÇĞİÖŞÜ]/u.test(w)) continue
    if (!new RegExp(`(?<![\\p{L}\\d])${escapeRe(w)}(?![\\p{L}\\d])`, 'u').test(text)) continue
    out[w] = say
  }
  return out
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Sözlükteki adları metinde okunuşla değiştirir (uzun ad önce; Türkçe ek korunur). */
export function applyLexicon(text: string, lex: SpokenLexicon | null | undefined): string {
  if (!lex) return text
  let t = text
  for (const w of Object.keys(lex).sort((a, b) => b.length - a.length)) {
    t = t.replace(new RegExp(`(?<![\\p{L}\\d])${escapeRe(w).replace(/ /g, '\\s+')}(?![\\p{L}\\d])`, 'gu'), lex[w]!)
  }
  return t
}

export function toSpokenTurkish(input: string, lexicon?: SpokenLexicon | null): string {
  // Ölüm / intihar dili seslendirmede asla söylenmez (kullanıcı kararı 26.11.2026).
  let t = ` ${applyLexicon(neutralizeSocialText(input), lexicon)} `
  // 1. noise the voice must not read
  t = t
    .replace(/https?:\/\/\S+|www\.\S+/g, ' ')
    .replace(/[#@][\p{L}\d_]+/gu, ' ')
    .replace(/\p{Extended_Pictographic}|️/gu, ' ')
    .replace(/[“”"«»]/g, '')
    .replace(/[’‘`´ʼ′]/g, "'")
  // 2. abbreviations
  for (const [re, w] of ABBREVIATIONS) t = t.replace(re, w)
  // 2b. initials «Y.D.», «A. Yılmaz», «M.K.A.»: the voice reads a lone capital + dot as a
  //     Roman ordinal (D. → «beş yüzüncü», C. → «yüzüncü»), so spell them as letters.
  t = t.replace(/(?<![\p{L}\d.])((?:[A-ZÇĞİÖŞÜ]\.\s?)+[A-ZÇĞİÖŞÜ]?)(?!\p{L})/gu, (m) => {
    const letters = m.replace(/[^A-ZÇĞİÖŞÜ]/g, '')
    return ` ${spell(letters)} `
  })
  // 2c. yabancı adlar: Türkçe ses «Phu Quoc»u «Pe He Hu Quoc» diye okur. Önce sözlük,
  //     sonra Türkçede olmayan harf öbekleri (ph → f, q → k). Yalnızca ses değişir.
  for (const [re, w] of FOREIGN_NAMES) t = t.replace(re, w)
  t = t.replace(/(?<![\p{L}])[\p{L}]*\p{Ll}[\p{L}]*(?![\p{L}])/gu, (w) =>
    /[pP][hH]|[qQ]/.test(w)
      ? w.replace(/Ph/g, 'F').replace(/PH/g, 'F').replace(/ph/g, 'f').replace(/Qu/g, 'Ku').replace(/qu/g, 'ku').replace(/Q/g, 'K').replace(/q/g, 'k')
      : w,
  )
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
  // 9b. REELS-17: suffix apostrophe joins the word. Chirp/Neural voices read «Yılmaz'ın»
  //     as «Yılmaz… ı ı n» (the suffix spelled out after a pause); written Turkish attaches
  //     the suffix anyway, so the voice hears «Yılmazın», «Kurum'un» → «Kurumun»,
  //     «Ce He Pe'nin» → «Ce He Penin», «yüzde 15'i» → «yüzde 15i». Screen text is untouched.
  t = t.replace(/(\p{L}|\d)'(?=\p{L})/gu, '$1')
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
