/**
 * FB / IG feed post caption builder.
 *
 * Manşet + özet asla kelime/cümle ortasından kesilmez.
 * Limit aşımında önce hashtag'ler, sonra özetten cümle sınırıyla kısaltılır;
 * manşet ve article URL korunur.
 *
 * Instagram Graph API feed publish: yalnızca `caption` alanı var —
 * ayrı `link` / `link_sticker_url` yok (sticker sadece STORIES).
 * Mavi onay / profesyonel hesaplarda caption içindeki URL tıklanabilir olur;
 * Meta bunu hesap tarafında açar, API'ye özel link alanı gerekmez.
 */

const DEFAULT_HASHTAGS = ['#NaHaber', '#Çanakkale', '#SonDakika']

/** Manşet sonunda bırakılmaması gereken bağlaç / sıfat / yarım öbekler */
const DANGLING_TAIL_RE =
  /\s+(ve|veya|ile|için|olan|olacak|olanlar|ama|fakat|ancak|ki|bir|bu|şu|o|de|da|kadar|gibi|üzerine|hakkında|sonrası|öncesi|nedeniyle|yüzünden|dolayı|yaşındaki|yaşında|aylık|günlük|yıllık|adlı|isimli|konulu|yönelik|ilişkin|ait|edilen|edilmiş|yapılan|vurulan|yaralanan|öldürülen|gözaltına|tutuklanan|açıklayan|söyleyen|belirten|ağır|hafif|kritik|ciddi|ölümcül|ödeyerek|diyerek|alarak|gelerek|giderek|bakarak|karşı|doğru|ait|üzere)\s*$/iu

/** Zarf-fiil + yönelme/ayrılma hali (örn. "ödeyerek dolara") — cümle yarım */
const GERUND_PLUS_CASE_RE =
  /\S+(y?arak|y?erek)\s+[\p{L}'’-]{3,}[ae]\s*$/iu

/**
 * Manşet zarf-fiil / ulaç / sıfat-fiil ayrılma hali ile biterse anlam tamamlanmamış.
 * Önceki boşluk: yalnızca -arak/-erek/-ip; "girdikten" / "olunca" / "gitmeden" kaçıyordu
 * → OG overlay "…denize girdikten" gibi yarım manşet basıyordu.
 */
const ENDS_WITH_SUBORDINATOR_RE =
  /(?:y?arak|y?erek|y?[ıiuü]p|[dt][ıiuü]ktan|[dt][iü]kten|[ıiuü]nca|[iü]nce|madan|meden)$/iu

/** "-ken" ulaç; "erken" / "iken" false positive değil */
const ENDS_WITH_KEN_RE = /ken$/iu
const KEN_FALSE_POSITIVE = /^(erken|iken)$/iu

function endsWithIncompleteSubordinator(t: string): boolean {
  const last = (t.split(/\s+/).pop() || '').replace(/["'»”’)\]]+$/u, '')
  if (!last) return false
  if (ENDS_WITH_SUBORDINATOR_RE.test(last)) return true
  if (ENDS_WITH_KEN_RE.test(last) && !KEN_FALSE_POSITIVE.test(last)) return true
  return false
}

function toTrLower(s: string): string {
  return s.toLocaleLowerCase('tr-TR')
}

function wordStemRough(w: string): string {
  return toTrLower(w)
    .replace(/['’]/g, '')
    .replace(/ğ/g, 'g')
    .replace(/(nın|nin|nun|nün|lar|ler|dan|den|tan|ten|yla|yle)$/u, '')
    .replace(/(sı|si|su|sü|ı|i|u|ü|a|e|ya|ye)$/u, '')
}

function stemsRelated(a: string, b: string): boolean {
  const na = wordStemRough(a)
  const nb = wordStemRough(b)
  if (na.length < 4 || nb.length < 4) return false
  if (na === nb || na.startsWith(nb) || nb.startsWith(na)) return true
  const n = Math.min(4, na.length, nb.length)
  return na.slice(0, n) === nb.slice(0, n)
}

function hasUnbalancedQuotes(t: string): boolean {
  // Türkçe kesme (Gürkaynak'tan) tek tırnak sayılmaz — yalnızca çift / akıllı tırnak
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ['“', '”'],
    ['«', '»'],
  ]
  for (const [open, close] of pairs) {
    if (open === close) {
      const n = (t.match(new RegExp(open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
      if (n % 2 === 1) return true
    } else {
      const opens = (t.match(new RegExp(open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
      const closes = (t.match(new RegExp(close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
      if (opens !== closes) return true
    }
  }
  return false
}

/**
 * Son kelime gereksiz tekrar / trailing junk:
 * "…çocuğu ağır yaralandı çocuk" → son "çocuk" düşer.
 */
export function stripTrailingHeadlineJunk(s: string): string {
  let out = s.replace(/\s+/g, ' ').trim()
  for (let guard = 0; guard < 4; guard++) {
    const words = out.split(' ').filter(Boolean)
    if (words.length < 4) return out
    const last = words[words.length - 1]
    const prev = words[words.length - 2]
    if (!/(dı|di|du|dü|tı|ti|tu|tü|mış|miş|muş|müş)$/iu.test(prev)) {
      return out
    }
    const earlierWords = words.slice(0, -1)
    if (earlierWords.some((w) => stemsRelated(w, last))) {
      out = earlierWords.join(' ')
      continue
    }
    return out
  }
  return out
}

export function stripDanglingHeadlineTail(s: string): string {
  let out = stripTrailingHeadlineJunk(s.replace(/\s+/g, ' ').trim())
  for (let i = 0; i < 8; i++) {
    const next = out.replace(DANGLING_TAIL_RE, '').trim()
    if (next === out) break
    out = next
  }
  return out
}

export function hasDanglingHeadlineTail(s: string): boolean {
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t) return false
  return DANGLING_TAIL_RE.test(t)
}

/** Manşet bitmeden kesilmiş / yarım öbek / trailing junk? */
export function isIncompleteHeadline(s: string): boolean {
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t) return true
  if (hasDanglingHeadlineTail(t)) return true
  if (endsWithIncompleteSubordinator(t)) return true
  if (GERUND_PLUS_CASE_RE.test(t)) return true
  if (hasUnbalancedQuotes(t)) return true
  if (stripTrailingHeadlineJunk(t) !== t) return true
  return false
}

export function clampAtWordBoundary(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) {
    const cleaned = stripDanglingHeadlineTail(t)
    return isIncompleteHeadline(cleaned) ? shortenToLastCompleteClause(cleaned, max) : cleaned
  }
  const slice = t.slice(0, max)
  const sp = slice.lastIndexOf(' ')
  let out = (sp > max * 0.45 ? slice.slice(0, sp) : slice).trim()
  // Yarım anlam bırakma: "…5 yaşındaki" / "…ağır" / "…vurulan" gibi sarkan sıfat/fiilimsi
  out = stripDanglingHeadlineTail(out)
  if (isIncompleteHeadline(out)) {
    out = shortenToLastCompleteClause(out, max)
  }
  // Aşırı kısaldıysa orijinal kelime sınırına geri dön (boş manşet olmasın)
  if (out.length < Math.min(24, Math.floor(max * 0.35))) {
    out = (sp > max * 0.45 ? slice.slice(0, sp) : slice)
      .replace(/\s+(ve|veya|ile|için|olan|ama|fakat|ancak|ki|:|,)\s*$/iu, '')
      .trim()
    out = stripDanglingHeadlineTail(out)
  }
  return out
}

/**
 * Sığmazsa son TAM öbekte bitir (virgül / iki nokta / tire / noktalı virgül).
 * Ortadan kelime/öbek kesme — "…ödeyerek dolara" gibi yarım bitiş yok.
 */
export function shortenToLastCompleteClause(s: string, maxLen: number): string {
  const t = stripDanglingHeadlineTail(s.replace(/\s+/g, ' ').trim())
  if (!t) return ''
  if (t.length <= maxLen && !isIncompleteHeadline(t)) return t

  const budget = Math.min(maxLen, t.length)
  const slice = t.slice(0, budget)
  const minEnd = Math.min(28, Math.floor(maxLen * 0.4))
  const clauseRe = /[,;:—–-](?=\s|$)/g
  let best = -1
  let m: RegExpExecArray | null
  while ((m = clauseRe.exec(slice)) !== null) {
    const end = m.index
    if (end >= minEnd) best = end
  }
  if (best >= minEnd) {
    const clause = stripDanglingHeadlineTail(slice.slice(0, best).trim())
    if (clause.length >= minEnd && !isIncompleteHeadline(clause)) return clause
  }

  // Clause yoksa kelime kelime geriye: ilk tamamlanmış adayı bul
  const words = slice.split(' ').filter(Boolean)
  while (words.length > 2) {
    words.pop()
    const candidate = stripDanglingHeadlineTail(words.join(' '))
    if (candidate.length >= minEnd && !isIncompleteHeadline(candidate)) return candidate
  }
  return stripDanglingHeadlineTail(words.join(' '))
}

/**
 * Manşet için: mümkünse limiti aşmadan TAM başlığı koru;
 * kısaltmak zorundaysa kelime sınırında + sarkan sıfat temizliği.
 * Max'ı biraz esnetmek (softMax) yarım cümleyi önlemek için tercih edilir.
 *
 * ÖNEMLİ: max altında olsa bile sarkan sıfat/bağlaç ASLA bırakılmaz
 * (örn. "…çocuğu ağır" → ya softMax ile "yaralı" korunur ya "ağır" düşer).
 */
export function clampCompleteHeadline(s: string, max: number, softMax = max + 24): string {
  const t = s.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim()
  if (!t) return ''
  const plain = stripDanglingHeadlineTail(t.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
  if (!plain) return ''

  // softMax içinde tam metin sığıyorsa koru (yarım "yaralı" düşmesin)
  if (plain.length <= softMax && !isIncompleteHeadline(plain)) {
    return t.includes('\n') && plain.length <= max ? stripDanglingHeadlineTail(t) : plain
  }
  if (plain.length <= softMax) {
    const stripped = stripDanglingHeadlineTail(plain)
    if (stripped.length >= Math.min(24, Math.floor(max * 0.45)) && !isIncompleteHeadline(stripped)) {
      return stripped
    }
    return shortenToLastCompleteClause(stripped, softMax)
  }
  if (plain.length <= max && !isIncompleteHeadline(plain)) {
    return t.includes('\n') ? stripDanglingHeadlineTail(t) : plain
  }
  return shortenToLastCompleteClause(plain, max)
}

/**
 * Manşet adayı + kaynak başlık: kesilmiş / yarım / junk aday varsa
 * kaynak başlığı tercih et (OG + AI yolları).
 */
export function fitCompleteHeadline(
  candidate: string,
  sourceTitle: string,
  max: number,
  softMax = max + 24,
): string {
  const cand = stripDanglingHeadlineTail((candidate || '').replace(/\s+/g, ' ').trim())
  const source = stripDanglingHeadlineTail((sourceTitle || '').replace(/\s+/g, ' ').trim())
  if (!cand && !source) return ''
  if (!cand) return clampCompleteHeadline(source, max, softMax)
  if (!source) return clampCompleteHeadline(cand, max, softMax)

  const cl = toTrLower(cand)
  const sl = toTrLower(source)
  let best = cand

  // Aday, kaynak başlığın kesilmiş önekiyse kaynağı al
  if (sl.startsWith(cl) && source.length > cand.length) {
    best = source
  } else if (isIncompleteHeadline(cand) && !isIncompleteHeadline(source)) {
    // AI yarım bıraktı ("…dolara") / junk ("…yaralandı çocuk") → kaynak title
    best = source
  } else if (isIncompleteHeadline(cand) && source.length >= cand.length - 8) {
    best = source
  } else if (hasDanglingHeadlineTail(cand) && source.length > cand.length) {
    best = source
  }

  return clampCompleteHeadline(best, max, softMax)
}

/**
 * OG görsel manşeti: tam kaynak başlığı tercih et;
 * AI socialHeadline yalnızca tamamlanmış ve kaynak kadar güvenilirse kullanılır.
 */
export function pickCompleteOgHeadline(
  socialHeadline: string,
  sourceTitle: string,
  max: number,
  softMax = max + 40,
): string {
  const ai = stripDanglingHeadlineTail((socialHeadline || '').replace(/\s+/g, ' ').trim())
  const src = stripDanglingHeadlineTail((sourceTitle || '').replace(/\s+/g, ' ').trim())
  if (!ai && !src) return ''
  if (!ai) return clampCompleteHeadline(src, max, softMax)
  if (!src) return clampCompleteHeadline(ai, max, softMax)

  if (isIncompleteHeadline(ai) && !isIncompleteHeadline(src)) {
    return clampCompleteHeadline(src, max, softMax)
  }
  if (isIncompleteHeadline(ai)) {
    return fitCompleteHeadline(ai, src, max, softMax)
  }
  // AI manşeti tamam ama kaynak daha uzun ve AI onun kesik öneki gibi → kaynak
  if (toTrLower(src).startsWith(toTrLower(ai)) && src.length > ai.length + 8 && !isIncompleteHeadline(src)) {
    return clampCompleteHeadline(src, max, softMax)
  }
  return fitCompleteHeadline(ai, src, max, softMax)
}

/** Cümle sonu: .!?… + isteğe bağlı kapanış tırnak/parantez (örn. gelmek.') */
const SENTENCE_END_RE = /[.!?…]["'»”’)\]]*(?=\s|$)/g
const COMPLETE_SENTENCE_TAIL_RE = /[.!?…]["'»”’)\]]*$/
/** Nokta yoksa son çare: noktalı virgül / iki nokta ile biten tam yan cümle */
const CLAUSE_END_RE = /[;:](?=\s|$)/g

/**
 * Unvan / sayı kısaltmaları — "Dr." / "23." cümle sonu DEĞİL.
 * Meta AI "…avukat Dr." kesiminde nokta yüzünden yanlış "tam cümle" sayılıyordu.
 */
const ABBREV_BEFORE_DOT_RE =
  /(?:^|[\s(/[{])(?:(?:[Dd]r|[Mm]r|[Mm]rs|[Mm]s|[Pp]rof|[Aa]v|[Ss]n|[Vv][bs]|[Bb]n|[Yy]rd\.?\s*[Dd]o[çc]|[Hh]z|[Nn]o|[Ss]ay|[Cc]ad|[Ss]ok|[Mm]ah)|(?:\d{1,4}))$/u

/** Caption sonunda bırakılmaması gereken unvan / yarım öbek */
const CAPTION_DANGLING_TAIL_RE =
  /\s+(?:Dr|Av|Prof|Sn|Mr|Mrs|Ms|vs|Vb|No|Yrd\.?\s*Do[çc])\.?\s*$/iu

function isAbbreviationDot(text: string, dotIndex: number): boolean {
  return ABBREV_BEFORE_DOT_RE.test(text.slice(0, dotIndex))
}

/** Gerçek cümle sonu mu? "Dr." / "23." sayılmaz. */
export function endsWithCompleteSentence(s: string): boolean {
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t) return false
  const m = COMPLETE_SENTENCE_TAIL_RE.exec(t)
  if (!m) return false
  if (m[0].startsWith('.') && isAbbreviationDot(t, m.index)) return false
  return true
}

function findLastRealSentenceEnd(slice: string, minEnd: number): number {
  let best = -1
  SENTENCE_END_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = SENTENCE_END_RE.exec(slice)) !== null) {
    const end = m.index + m[0].length
    if (slice[m.index] === '.' && isAbbreviationDot(slice, m.index)) continue
    if (end >= minEnd) best = end
  }
  return best
}

/**
 * Caption / özet yarım mı? Unvan kesimi (…avukat Dr.), sarkan bağlaç, zarf-fiil.
 */
export function isIncompleteCaption(s: string): boolean {
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t) return true
  if (CAPTION_DANGLING_TAIL_RE.test(t)) return true
  if (hasDanglingHeadlineTail(t)) return true
  if (endsWithIncompleteSubordinator(t)) return true
  if (GERUND_PLUS_CASE_RE.test(t)) return true
  if (hasUnbalancedQuotes(t)) return true
  // Uzun metin noktasız / kısaltma noktasıyla bitiyorsa kesilmiş say
  if (t.length >= 48 && !endsWithCompleteSentence(t) && /[,;:\-–—]\s*$/.test(t)) return true
  if (t.length >= 48 && COMPLETE_SENTENCE_TAIL_RE.test(t) && !endsWithCompleteSentence(t)) {
    return true
  }
  return false
}

/**
 * Meta AI caption DeepSeek/kaynak özetine göre ince veya yarım mı?
 * İnceyse publisher DeepSeek caption'a düşmeli.
 */
export function isThinSocialCaption(caption: string, richerSource?: string): boolean {
  const c = (caption || '').replace(/\s+/g, ' ').trim()
  if (!c) return true
  if (isIncompleteCaption(c)) return true
  if (c.length < 90) return true
  const src = (richerSource || '').replace(/\s+/g, ' ').trim()
  // Kaynak belirgin zengin + AI çok kısa → ince
  if (src.length >= 220 && c.length < Math.min(160, Math.floor(src.length * 0.35))) {
    return true
  }
  return false
}

/**
 * Tam cümle(ler) sınırında kısalt; mümkün değilse kelime sınırında.
 * softMax: cümle softMax içinde bitiyorsa tamamını koru (yarım "taburcu" engeli).
 * Tırnaklı bitişleri de tanır: "…gelmek.' 5 yıldır…" → ilk cümlede durur.
 *
 * ÖNEMLİ: max altında olsa bile yarım cümle/kelime ASLA dönmez.
 * (Eski erken return: len<=max → incomplete Meta AI / spot metni olduğu gibi kalıyordu.)
 * "Dr." / "23." gibi kısaltma noktaları cümle sonu sayılmaz.
 */
export function clampCompleteSentences(s: string, max: number, softMax = max + 24): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t) return ''

  const complete = endsWithCompleteSentence(t)
  if (complete && t.length <= max) return t
  if (complete && t.length <= softMax) return t

  const slice = t.slice(0, Math.max(max, softMax))
  const minEnd = Math.min(36, Math.floor(max * 0.35))

  const hard = findLastRealSentenceEnd(slice, minEnd)
  if (hard >= minEnd) {
    const cut = slice.slice(0, hard).trim()
    if (!isIncompleteCaption(cut)) return cut
    // "…Dr." seçildiyse bir önceki gerçek cümleye gerile
    const earlier = findLastRealSentenceEnd(slice.slice(0, Math.max(0, hard - 1)), minEnd)
    if (earlier >= minEnd) return slice.slice(0, earlier).trim()
  }

  // Hiç .!? yok ama metin yarım → ;/: ile biten yan cümlede dur (Fethiye "…atladı; … can")
  if (!complete) {
    let best = -1
    CLAUSE_END_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = CLAUSE_END_RE.exec(slice)) !== null) {
      const end = m.index + m[0].length
      if (end >= minEnd) best = end
    }
    if (best >= minEnd) {
      return slice.slice(0, best).trim().replace(/[;:]+$/, '.')
    }
  }

  // Son çare: kelime sınırı — unvan kuyruğunu (…avukat Dr.) düşür
  const budget = Math.min(max, Math.max(minEnd, Math.floor(max * 0.9)))
  let byWord = clampAtWordBoundary(t, t.length <= max ? budget : max)
  if (CAPTION_DANGLING_TAIL_RE.test(byWord)) {
    const stripped = byWord.replace(CAPTION_DANGLING_TAIL_RE, '').trim()
    if (stripped.length >= minEnd) byWord = stripped
  }
  return byWord
}

export interface FeedCaptionInput {
  /** Tam manşet — kesilmeden başa konur */
  title: string
  /** AI özet / açıklama paragrafları (URL ve hashtag içermez) */
  body?: string
  articleUrl?: string
  hashtags?: string[]
  /** Instagram 2200; Facebook pratikte daha geniş — güvenli üst sınır */
  maxLen?: number
}

/**
 * Post caption:
 *   📰 {tam manşet}
 *
 *   {tam özet paragrafları}
 *
 *   Haberi Oku:
 *   {articleUrl}
 *
 *   #tag1 #tag2 …
 */
export function buildFeedCaption(input: FeedCaptionInput): string {
  const maxLen = input.maxLen ?? 2200
  const title = input.title.replace(/\s+/g, ' ').trim()
  const body = (input.body ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const url = input.articleUrl?.trim() || ''
  const tags = (input.hashtags?.length ? input.hashtags : DEFAULT_HASHTAGS)
    .map((t) => {
      const s = String(t).trim()
      return s.startsWith('#') ? s : `#${s}`
    })
    .filter(Boolean)

  const linkBlock = url ? `Haberi Oku:\n${url}` : ''
  const tagLine = tags.join(' ')

  const assemble = (manset: string, ozet: string, withTags: boolean) => {
    const parts: string[] = [`📰 ${manset}`]
    if (ozet) {
      parts.push('')
      parts.push(ozet)
    }
    if (linkBlock) {
      parts.push('')
      parts.push(linkBlock)
    }
    if (withTags && tagLine) {
      parts.push('')
      parts.push(tagLine)
    }
    return parts.join('\n')
  }

  // 1) Tam metin
  let caption = assemble(title, body, true)
  if (caption.length <= maxLen) return caption

  // 2) Hashtag'siz dene — manşet + özet + URL öncelikli
  caption = assemble(title, body, false)
  if (caption.length <= maxLen) return caption

  // 3) Özeti cümle sınırında kısalt; manşet + URL sabit
  const fixedOverhead = assemble(title, '', false).length + (body ? 2 : 0) // + boş satırlar
  const bodyBudget = Math.max(80, maxLen - fixedOverhead - 8)
  const trimmedBody = clampCompleteSentences(body.replace(/\n+/g, ' '), bodyBudget)
  caption = assemble(title, trimmedBody, false)
  if (caption.length <= maxLen) return caption

  // 4) Son çare: manşeti kelime sınırında kısalt (URL yine tam kalsın)
  const urlOverhead = linkBlock ? linkBlock.length + 2 : 0
  const titleBudget = Math.max(40, maxLen - urlOverhead - 4) // "📰 " + newlines
  const shortTitle = clampAtWordBoundary(title, titleBudget)
  caption = assemble(shortTitle, '', false)
  if (caption.length <= maxLen) return caption

  // Asla URL'yi ortadan kesme — limit aşarsa URL'siz manşet (nadir)
  return clampAtWordBoundary(`📰 ${shortTitle}`, maxLen)
}
