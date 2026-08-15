/**
 * Sosyal manşet / caption olgu sadakati.
 *
 * AI kısaltırken "15 hava araçı" → "15 hava" gibi anlam taşıyan isimleri
 * düşürüp hem olguyu hem Türkçe dilbilgisini bozabiliyor. Bu modül kaynak
 * metindeki kritik öbekleri (sayı + isim tamlaması) geri yerleştirir.
 */

const STOP = new Set([
  've', 'veya', 'ile', 'için', 'olan', 'ama', 'fakat', 'ancak', 'ki', 'bir', 'bu', 'şu', 'o',
  'de', 'da', 'mi', 'mı', 'mu', 'mü', 'ne', 'ya', 'hem', 'gibi', 'kadar', 'çok', 'daha',
  'en', 'ise', 'diye', 'üzere', 'sonra', 'önce', 'beri',
])

/** ASCII \b Türkçe harflerden sonra güvenilir değil — Unicode sınır kullan. */
const WB = '(?<![\\p{L}])'
const WE = '(?![\\p{L}])'

const COMPOUND_REPAIRS: Array<{
  source: RegExp
  broken: RegExp
  replace: string
}> = [
  {
    source: new RegExp(`${WB}hava\\s+ara[c\u00e7](?:\u0131|i|lari|lar\u0131)${WE}`, 'iu'),
    broken: /(\d+[.,]?\d*)\s+hava(?!\s+ara[c\u00e7])/giu,
    replace: '$1 hava ara\u00e7\u0131',
  },
  {
    source: new RegExp(`${WB}hava\\s+ara[c\u00e7](?:\u0131|i|lari|lar\u0131)${WE}`, 'iu'),
    broken: new RegExp(`${WB}hava(?!\\s+ara[c\u00e7])\\s+(m\u00fcdahale|destek|s\u00f6nd\u00fcrm|devriye|operasyon)`, 'giu'),
    replace: 'hava ara\u00e7\u0131 $1',
  },
  {
    source: new RegExp(`${WB}itfaiye\\s+ekib(?:i|leri)${WE}`, 'iu'),
    broken: /(\d+[.,]?\d*)\s+itfaiye(?!\s+ekib)/giu,
    replace: '$1 itfaiye ekibi',
  },
  {
    source: new RegExp(`${WB}orman\\s+yang\u0131n(?:\u0131|i|lari|lar\u0131)${WE}`, 'iu'),
    broken: new RegExp(`${WB}orman(?!\\s+yang\u0131n)\\s+(\u00e7\u0131kt\u0131|s\u00f6nd\u00fcr\u00fcld|m\u00fcdahale|kontrol)`, 'giu'),
    replace: 'orman yang\u0131n\u0131 $1',
  },
  {
    source: new RegExp(`${WB}yerle\u015fim\\s+yer(?:i|leri)${WE}`, 'iu'),
    broken: new RegExp(`${WB}yerle\u015fim(?!\\s+yer)\\s+(ula\u015f|s\u0131\u00e7ra|yakla\u015f|tehdit)`, 'giu'),
    replace: 'yerle\u015fim yeri $1',
  },
]

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function toTrLower(s: string): string {
  return s.toLocaleLowerCase('tr-TR')
}

/** Kaynaktan sayı + 2–4 kelimelik olgu öbekleri çıkar (örn. "15 hava araçı"). */
export function extractFactualPhrases(source: string): string[] {
  const text = normalizeWs(source)
  if (!text) return []
  const out: string[] = []
  const re = /\b(\d+[.,]?\d*)\s+([\p{L}'’-]+(?:\s+[\p{L}'’-]+){1,3})/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const num = m[1]
    const words = m[2].split(/\s+/).filter(Boolean)
    for (let n = Math.min(words.length, 4); n >= 2; n--) {
      const slice = words.slice(0, n)
      if (slice.every((w) => STOP.has(toTrLower(w)))) continue
      const phrase = `${num} ${slice.join(' ')}`
      if (!out.some((p) => toTrLower(p) === toTrLower(phrase))) out.push(phrase)
      break
    }
  }
  return out
}

/**
 * Kaynakta olan sayı+tamlama öbeği çıktıda eksikse (örn. "15 hava" varken
 * kaynak "15 hava araçı"), eksik kelimeleri geri koy.
 */
function restoreNumberedPhrases(text: string, source: string): string {
  const phrases = extractFactualPhrases(source)
  if (phrases.length === 0) return text

  let out = text
  for (const phrase of phrases) {
    const words = phrase.split(/\s+/)
    if (words.length < 3) continue
    const num = words[0]
    const first = words[1]
    const rest = words.slice(2)
    const fullRe = new RegExp(escapeRegExp(phrase), 'iu')
    if (fullRe.test(out)) continue

    const stemRe = new RegExp(
      `(${escapeRegExp(num)}\\s+${escapeRegExp(first)})(?!\\s+${escapeRegExp(rest[0])})`,
      'iu',
    )
    if (!stemRe.test(out)) continue

    out = out.replace(stemRe, (match, stemMatch: string, offset: number) => {
      const after = out.slice(offset + match.length)
      const nextWord = after.match(/^\s*([\p{L}'’-]+)/u)?.[1]
      const insert: string[] = []
      for (const w of rest) {
        if (nextWord && toTrLower(w) === toTrLower(nextWord)) break
        insert.push(w)
      }
      if (insert.length === 0) return match
      return `${stemMatch} ${insert.join(' ')}`
    })
  }
  return out
}

function applyCompoundRepairs(text: string, source: string): string {
  let out = text
  for (const rule of COMPOUND_REPAIRS) {
    const sourceRe = new RegExp(rule.source.source, rule.source.flags)
    const brokenRe = new RegExp(rule.broken.source, rule.broken.flags)
    if (!sourceRe.test(source)) continue
    out = out.replace(brokenRe, rule.replace)
  }
  return out
}

/**
 * AI / kısaltma sonrası metni kaynak habere göre olgu-sadık hale getir.
 * Manşet, story özeti ve caption için güvenle çağrılabilir.
 */
export function repairSocialCopyAgainstSource(
  text: string,
  sourceTitle: string,
  sourceBody = '',
): string {
  const raw = text ?? ''
  if (!raw.trim()) return raw
  const source = normalizeWs(`${sourceTitle}\n${sourceBody}`)
  if (!source) return raw

  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const repaired = lines.map((line) => {
    const t = line.replace(/[ \t]+/g, ' ').trim()
    if (!t) return line
    let next = applyCompoundRepairs(t, source)
    next = restoreNumberedPhrases(next, source)
    return next.replace(/\s{2,}/g, ' ').trim()
  })
  return repaired.join('\n')
}

/** Manşet için: kaynak başlığı da verir; boşsa dokunma. */
export function repairSocialHeadline(
  headline: string,
  sourceTitle: string,
  sourceBody = '',
): string {
  return repairSocialCopyAgainstSource(headline, sourceTitle, sourceBody)
}

const HEADLINE_STOP = new Set([
  ...STOP,
  'icin',
  'için',
  'sonra',
  'once',
  'önce',
  'karsi',
  'karşı',
])

function headlineTokens(s: string): string[] {
  return toTrLower(s)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !HEADLINE_STOP.has(w))
}

function copyWords(s: string): string[] {
  return toTrLower(s)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
}

/**
 * DeepSeek/Llama “kelime salatası”: aynı 3–4’lü öbek tekrarı
 * (örn. “yeniden hayata kişi kurtarılamadı … yeniden hayata kişi kurtarılamadı”).
 */
export function isGarbledSocialCopy(text: string): boolean {
  const words = copyWords(text)
  if (words.length < 8) return false

  const grams4 = new Set<string>()
  for (let i = 0; i <= words.length - 4; i++) {
    const g = words.slice(i, i + 4).join(' ')
    if (grams4.has(g)) return true
    grams4.add(g)
  }

  if (words.length >= 12) {
    const grams3 = new Set<string>()
    for (let i = 0; i <= words.length - 3; i++) {
      const g = words.slice(i, i + 3).join(' ')
      if (grams3.has(g)) return true
      grams3.add(g)
    }
  }

  return false
}

/**
 * Overlay manşeti kaynak habere bağlı mı?
 * Uydurma slogan, başlığa ekstra gövde parçası yapıştırma, tekrarlayan salata → hayır.
 */
export function isFaithfulSocialHeadline(candidate: string, sourceTitle: string): boolean {
  if (isGarbledSocialCopy(candidate)) return false
  const cand = headlineTokens(candidate)
  const srcList = headlineTokens(sourceTitle)
  const src = new Set(srcList)
  if (cand.length === 0 || src.size === 0) return false

  const extra = cand.filter((t) => !src.has(t)).length
  if (extra >= 2) return false

  const overlap = cand.filter((t) => src.has(t)).length
  if (overlap >= 3 && extra === 0) return true
  if (overlap >= 3 && extra <= 1 && cand.length <= srcList.length + 1) return true
  return extra === 0 && overlap / cand.length >= 0.45
}
