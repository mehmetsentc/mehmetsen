const SOURCE_LINE_RE = /^kaynak:\s*.+$/i

/**
 * Returns true when a paragraph is a naked URL fragment left by the article extractor.
 * e.g. extractor picks up "ais.osym.gov.tr/sonuc" from a breadcrumb/nav and splits
 * it across lines: ["ais.", "osym.", "gov.", "tr ve sonuc."] → all should be dropped.
 */
function isUrlFragmentParagraph(para: string): boolean {
  const t = para.trim()
  if (!t || t.length > 60) return false

  // Pure domain segment(s): "ais.", "osym.", "gov.", "com.tr", "www", "tr"
  if (/^[a-z0-9-]{1,30}(?:\.[a-z0-9-]{0,20})*\.?\s*$/i.test(t)) return true

  // Short token + Turkish conjunction + another short token: "tr ve sonuc.", "gov ve diger."
  if (t.length <= 35 && /^[a-z0-9-]{1,10}\s+(ve|ile|ya da|veya)\s+[a-z0-9-]+\.?\s*$/i.test(t))
    return true

  return false
}

/** Tabloid / SEO filler phrases — whole sentences containing these are dropped. */
const FILLER_SENTENCE_RE =
  /(?:merak edildi|merak ediliyor|işte ayrıntılar|işte detaylar|araştırılıyor|izleme linki|tıklayın|haberin devamı|detaylar için tıklayın|canlı izle|son gelişmeler merak|izlenme rekoru kır)/i

/** Vague clickbait questions without factual content. */
const CLICKBAIT_QUESTION_RE =
  /^(?:peki[,]?\s*)?(?:.+?\s+)?(?:yayınlandı mı|ne zaman yayınlanacak|nasıl izlenir|kim kazandı|kim oldu)\??\s*$/i

const TITLE_CLICKBAIT_RE = /\s+(?:izle|canlı izle|son dakika|flaş|flash|videolu|detaylı)\s*$/i

const TITLE_PIPE_SPAM_RE = /\s*\|[^|]*(?:\|[^|]*)*$/

const MAX_TITLE_LENGTH = 65
export const MAX_FEED_TEASER_LENGTH = 120

function isMostlyUppercase(text: string): boolean {
  const letters = [...text].filter((c) => /\p{L}/u.test(c))
  if (letters.length < 6) return false

  const upperCount = letters.filter(
    (c) => c === c.toLocaleUpperCase('tr-TR') && c !== c.toLocaleLowerCase('tr-TR')
  ).length

  return upperCount / letters.length > 0.65
}

function toTurkishSentenceCase(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  const lower = trimmed.toLocaleLowerCase('tr-TR')
  return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1)
}

function normalizeSentenceKey(sentence: string): string {
  return sentence
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .replace(/[.!?…]+$/g, '')
}

const KNOWN_ABBREVIATIONS = new Set([
  'dr',
  'prof',
  'doç',
  'doc',
  'av',
  'ytb',
  'tc',
  't.c',
  'a.ş',
  'ltd',
  'sti',
  'şb',
  'cad',
  'sok',
  'apt',
  'no',
  'vs',
  'vb',
  'bkz',
  'ör',
])

/**
 * Robust Turkish & English sentence splitter.
 * Protects:
 * - Time: 16.00, 09.30
 * - Decimals / numbers: 3.14, 1.000, 34.7
 * - Common titles / abbreviations: Prof. Dr. Doç. Av. vb.
 * - Multi-dot abbreviations: T.C. A.Ş.
 * - URLs / domains: example.com, www.example.com
 * - Initials: A.B.
 */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  // Tokenize sentences looking for true sentence terminators (. ! ? …) followed by whitespace & uppercase/quote/bracket
  const sentences: string[] = []
  let current = ''

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i]
    current += char

    if (char === '.' || char === '!' || char === '?' || char === '…') {
      // Consume any consecutive punctuation (e.g. "...", "!?")
      while (i + 1 < trimmed.length && /[.!?…]/.test(trimmed[i + 1])) {
        i++
        current += trimmed[i]
      }

      if (i + 1 >= trimmed.length) {
        break
      }

      const nextChar = trimmed[i + 1]

      // Only whitespace after punctuation can indicate a sentence boundary
      if (/\s/.test(nextChar)) {
        // Check if the period is inside a time, decimal number or digit group (e.g. "16.00", "3.14", "1.000")
        const prevDigit = /\d\.$/.test(current)
        const restAfterWhitespace = trimmed.slice(i + 1).trimStart()
        const nextDigit = /^\d/.test(restAfterWhitespace)

        if (prevDigit && nextDigit) {
          // It's a numeric/time punctuation (e.g. "16. 00" or boundary lookahead) -> do not split
          continue
        }

        // Check if the current word preceding period is a known abbreviation (e.g. "Dr.", "Prof.", "vb.")
        const lastWordMatch = current.match(/([a-zA-ZçğıöşüÇĞİÖŞÜ.]+)\.?$/)
        if (lastWordMatch) {
          const rawWord = lastWordMatch[1].toLowerCase().replace(/\.+$/, '')
          if (KNOWN_ABBREVIATIONS.has(rawWord) || /^[a-zçğıöşü]\.[a-zçğıöşü]$/i.test(lastWordMatch[1])) {
            continue
          }
        }

        // Check if next non-whitespace character starts a new sentence (Capital letter, quote, or dash)
        if (restAfterWhitespace.length > 0) {
          const firstNextChar = restAfterWhitespace[0]
          const isUpperCase = firstNextChar === firstNextChar.toLocaleUpperCase('tr-TR') &&
            firstNextChar !== firstNextChar.toLocaleLowerCase('tr-TR')
          const isQuoteOrBracket = /["'«“(‘[0-9]/.test(firstNextChar)

          if (isUpperCase || isQuoteOrBracket) {
            sentences.push(current.trim())
            current = ''
            // Skip the whitespace
            while (i + 1 < trimmed.length && /\s/.test(trimmed[i + 1])) {
              i++
            }
          }
        }
      }
    }
  }

  if (current.trim()) {
    sentences.push(current.trim())
  }

  return sentences.length > 0 ? sentences : [trimmed]
}

function isFillerSentence(sentence: string): boolean {
  const trimmed = sentence.trim()
  if (!trimmed) return true
  if (FILLER_SENTENCE_RE.test(trimmed)) return true
  if (CLICKBAIT_QUESTION_RE.test(trimmed)) return true
  if (/^peki[,]?\s*$/i.test(trimmed)) return true
  if (/^işte ayrıntılar[.…]*$/i.test(trimmed)) return true
  return false
}

function sentencesAreSimilar(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 12 || b.length < 12) return false

  const shorter = a.length <= b.length ? a : b
  const longer = a.length <= b.length ? b : a
  if (longer.includes(shorter) && shorter.length / longer.length > 0.75) return true

  return false
}

function dedupeSentences(sentences: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const sentence of sentences) {
    const key = normalizeSentenceKey(sentence)
    if (!key) continue

    const duplicate = [...seen].some((prev) => sentencesAreSimilar(prev, key))
    if (duplicate) continue

    const last = result[result.length - 1]
    if (last && sentencesAreSimilar(normalizeSentenceKey(last), key)) continue

    result.push(sentence)
    seen.add(key)
  }

  return result
}

/** Join broken mid-sentence line breaks such as "32.\n\nbölüm". */
export function mergeBrokenLines(text: string): string {
  let result = text.replace(/\r\n/g, '\n')

  // "32.\n\nbölüm" → "32. bölüm"
  result = result.replace(/(\d+)\.\s*(?:\n+\s*)+(?=[\p{Ll}])/gu, '$1. ')

  // Sentence-ending period + newline + lowercase continuation
  result = result.replace(
    /([^\n.!?…]{1,120})\.\s*(?:\n+\s*)+(?=[\p{Ll}])/gu,
    '$1. '
  )

  // Single newline after punctuation when next line continues the sentence
  result = result.replace(/([.!?…])\s*\n(?=[\p{Ll}])/gu, '$1 ')

  return result
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function stripTrailingFillerLoops(text: string): string {
  let result = text.trim()

  for (let i = 0; i < 5; i++) {
    const next = result
      .replace(/\n*(?:peki[,]?\s*)?(?:işte ayrıntılar|işte detaylar)[.…]*\s*$/i, '')
      .replace(/\n*işte ayrıntılar[.…]*\s*$/i, '')
      .trim()

    if (next === result) break
    result = next
  }

  return result
}

/** Clean news title for display and storage. */
/** HTML entity decoder — &#8217; → ' , &amp; → & , &lt; → < vb. */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
}

export function cleanupNewsTitle(title: string): string {
  let result = decodeHtmlEntities(title).trim()
  if (!result) return result

  const pipeIdx = result.indexOf('|')
  if (pipeIdx > 0) {
    const left = result.slice(0, pipeIdx).trim()
    const right = result.slice(pipeIdx + 1).trim()
    // "SON DAKİKA | Gerçek manşet" — sol etiket, sağ asıl başlık
    if (right.length > left.length && right.length >= 15) {
      result = right
    } else {
      result = result.replace(TITLE_PIPE_SPAM_RE, '')
    }
  } else {
    result = result.replace(TITLE_PIPE_SPAM_RE, '')
  }
  result = result.replace(TITLE_CLICKBAIT_RE, '')
  result = result.replace(/\s+/g, ' ').trim()

  if (isMostlyUppercase(result)) {
    result = toTurkishSentenceCase(result)
  }

  if (result.length > MAX_TITLE_LENGTH) {
    const cut = result.slice(0, MAX_TITLE_LENGTH)
    const lastSpace = cut.lastIndexOf(' ')
    result = lastSpace > MAX_TITLE_LENGTH * 0.6 ? cut.slice(0, lastSpace) : cut
    result = result.replace(/[,;:\-–—]\s*$/, '').trim()
  }

  return result
}

function truncateWithEllipsis(text: string, maxLength: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLength) return trimmed

  const cut = trimmed.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  const base =
    lastSpace > maxLength * 0.55 ? cut.slice(0, lastSpace) : cut.replace(/\s+\S*$/, '')
  return `${base.replace(/[,;:\-–—]\s*$/, '').trim()}…`
}

function stripTitleDuplicatePrefix(title: string, summary: string): string {
  const cleanTitle = title.trim()
  let teaser = summary.trim()
  if (!cleanTitle || !teaser) return teaser

  const titleNorm = normalizeSentenceKey(cleanTitle)
  const teaserNorm = normalizeSentenceKey(teaser)

  if (titleNorm === teaserNorm) return ''

  if (teaserNorm.startsWith(titleNorm)) {
    teaser = teaser.slice(cleanTitle.length).replace(/^[\s—–\-:,]+/, '').trim()
  } else if (
    teaser.toLocaleLowerCase('tr-TR').startsWith(cleanTitle.toLocaleLowerCase('tr-TR'))
  ) {
    teaser = teaser.slice(cleanTitle.length).replace(/^[\s—–\-:,]+/, '').trim()
  }

  if (!teaser || normalizeSentenceKey(teaser) === titleNorm) return ''
  return teaser
}

/** Clean news summary / lead paragraph. */
export function cleanupNewsSummary(summary: string): string {
  if (!summary.trim()) return ''

  let text = mergeBrokenLines(summary)
  text = normalizeWhitespace(text)

  const sentences = dedupeSentences(
    splitSentences(text).filter((s) => !isFillerSentence(s))
  )

  return sentences.slice(0, 2).join(' ').trim()
}

/** Feed teaser below image — unique, short, never repeats the headline verbatim. */
export function buildFeedTeaser(title: string, summary: string, content?: string): string {
  const cleanTitle = cleanupNewsTitle(title)
  let teaser = cleanupNewsSummary(summary)

  if (!teaser && content?.trim()) {
    const sentences = splitSentences(cleanupNewsBody(content, { preserveSourceLine: false }))
    teaser =
      sentences.find((s) => normalizeSentenceKey(s) !== normalizeSentenceKey(cleanTitle)) ??
      sentences[0] ??
      ''
  }

  teaser = stripTitleDuplicatePrefix(cleanTitle, teaser)
  if (!teaser) return ''

  return truncateWithEllipsis(teaser, MAX_FEED_TEASER_LENGTH)
}

export interface CleanupNewsBodyOptions {
  /** Keep trailing "Kaynak: …" line (default true). */
  preserveSourceLine?: boolean
}

/** Clean news body text for display and storage. */
export function cleanupNewsBody(
  body: string,
  options: CleanupNewsBodyOptions = {}
): string {
  const preserveSource = options.preserveSourceLine !== false
  if (!body.trim()) return ''

  const lines = body.split(/\n/)
  const sourceLines: string[] = []
  const contentLines: string[] = []

  for (const line of lines) {
    if (SOURCE_LINE_RE.test(line.trim())) {
      if (preserveSource) sourceLines.push(line.trim())
      continue
    }
    contentLines.push(line)
  }

  let text = contentLines.join('\n')
  text = mergeBrokenLines(text)
  text = normalizeWhitespace(text)
  text = stripTrailingFillerLoops(text)

  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const cleanedParagraphs: string[] = []

  for (const paragraph of paragraphs) {
    // Drop naked URL fragment lines picked up by the extractor from page navigation
    if (isUrlFragmentParagraph(paragraph)) continue

    const merged = mergeBrokenLines(paragraph.replace(/\n+/g, ' ').trim())
    const sentences = dedupeSentences(
      splitSentences(merged).filter((s) => !isFillerSentence(s))
    )
    if (sentences.length > 0) {
      cleanedParagraphs.push(sentences.join(' '))
    }
  }

  let result = cleanedParagraphs.join('\n\n')

  if (sourceLines.length > 0) {
    result = result ? `${result}\n\n${sourceLines.join('\n')}` : sourceLines.join('\n')
  }

  return result.trim()
}
