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
  /\s+(ve|veya|ile|için|olan|olacak|olanlar|ama|fakat|ancak|ki|bir|bu|şu|o|de|da|kadar|gibi|üzerine|hakkında|sonrası|öncesi|nedeniyle|yüzünden|dolayı|yaşındaki|yaşında|aylık|günlük|yıllık|adlı|isimli|konulu|yönelik|ilişkin|ait|edilen|edilmiş|yapılan|vurulan|yaralanan|öldürülen|gözaltına|tutuklanan|açıklayan|söyleyen|belirten|ağır|hafif|kritik|ciddi|ölümcül)\s*$/iu

export function stripDanglingHeadlineTail(s: string): string {
  let out = s.replace(/\s+/g, ' ').trim()
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

export function clampAtWordBoundary(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return stripDanglingHeadlineTail(t)
  const slice = t.slice(0, max)
  const sp = slice.lastIndexOf(' ')
  let out = (sp > max * 0.45 ? slice.slice(0, sp) : slice).trim()
  // Yarım anlam bırakma: "…5 yaşındaki" / "…ağır" / "…vurulan" gibi sarkan sıfat/fiilimsi
  out = stripDanglingHeadlineTail(out)
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
  const plain = t.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (!plain) return ''

  // softMax içinde tam metin sığıyorsa koru (yarım "yaralı" düşmesin)
  if (plain.length <= softMax && !hasDanglingHeadlineTail(plain)) {
    return t.includes('\n') && plain.length <= max ? t : plain
  }
  if (plain.length <= softMax) {
    // Sarkan kuyruk var ama softMax içinde — önce kaynak uzun metni olduğu gibi dene
    // (çoğu zaman AI yarım bıraktı; çağıran fitCompleteHeadline ile tamamlar)
    const stripped = stripDanglingHeadlineTail(plain)
    if (stripped.length >= Math.min(24, Math.floor(max * 0.45))) return stripped
  }
  if (plain.length <= max && !hasDanglingHeadlineTail(plain)) {
    return t.includes('\n') ? t : plain
  }
  return clampAtWordBoundary(plain, max)
}

/**
 * Manşet adayı + kaynak başlık: kesilmiş önek veya sarkan kuyruk varsa
 * daha uzun/tam başlığı tercih et (OG + AI yolları).
 */
export function fitCompleteHeadline(
  candidate: string,
  sourceTitle: string,
  max: number,
  softMax = max + 24,
): string {
  const cand = (candidate || '').replace(/\s+/g, ' ').trim()
  const source = (sourceTitle || '').replace(/\s+/g, ' ').trim()
  if (!cand && !source) return ''
  if (!cand) return clampCompleteHeadline(source, max, softMax)
  if (!source) return clampCompleteHeadline(cand, max, softMax)

  const cl = cand.toLocaleLowerCase('tr-TR')
  const sl = source.toLocaleLowerCase('tr-TR')
  let best = cand
  // Aday, kaynak başlığın kesilmiş önekiyse (…ağır vs …ağır yaralı) kaynağı al
  if (sl.startsWith(cl) && source.length > cand.length) {
    best = source
  } else if (hasDanglingHeadlineTail(cand) && !hasDanglingHeadlineTail(source) && source.length >= cand.length - 8) {
    best = source
  } else if (hasDanglingHeadlineTail(cand) && source.length > cand.length) {
    best = source
  }

  return clampCompleteHeadline(best, max, softMax)
}

/** Cümle sonu: .!?… + isteğe bağlı kapanış tırnak/parantez (örn. gelmek.') */
const SENTENCE_END_RE = /[.!?…]["'»”’)\]]*(?=\s|$)/g
const COMPLETE_SENTENCE_TAIL_RE = /[.!?…]["'»”’)\]]*$/
/** Nokta yoksa son çare: noktalı virgül / iki nokta ile biten tam yan cümle */
const CLAUSE_END_RE = /[;:](?=\s|$)/g

/**
 * Tam cümle(ler) sınırında kısalt; mümkün değilse kelime sınırında.
 * softMax: cümle softMax içinde bitiyorsa tamamını koru (yarım "taburcu" engeli).
 * Tırnaklı bitişleri de tanır: "…gelmek.' 5 yıldır…" → ilk cümlede durur.
 *
 * ÖNEMLİ: max altında olsa bile yarım cümle/kelime ASLA dönmez.
 * (Eski erken return: len<=max → incomplete Meta AI / spot metni olduğu gibi kalıyordu.)
 */
export function clampCompleteSentences(s: string, max: number, softMax = max + 24): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t) return ''

  const complete = COMPLETE_SENTENCE_TAIL_RE.test(t)
  if (complete && t.length <= max) return t
  if (complete && t.length <= softMax) return t

  const slice = t.slice(0, Math.max(max, softMax))
  const minEnd = Math.min(36, Math.floor(max * 0.35))

  const lastEnd = (re: RegExp): number => {
    let best = -1
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(slice)) !== null) {
      const end = m.index + m[0].length
      if (end >= minEnd) best = end
    }
    return best
  }

  const hard = lastEnd(SENTENCE_END_RE)
  if (hard >= minEnd) {
    return slice.slice(0, hard).trim()
  }

  // Hiç .!? yok ama metin yarım → ;/: ile biten yan cümlede dur (Fethiye "…atladı; … can")
  if (!complete) {
    const soft = lastEnd(CLAUSE_END_RE)
    if (soft >= minEnd) {
      return slice.slice(0, soft).trim().replace(/[;:]+$/, '.')
    }
  }

  // Son çare: kelime sınırı — max'tan kısa yarım metni olduğu gibi bırakma
  const budget = Math.min(max, Math.max(minEnd, Math.floor(max * 0.9)))
  return clampAtWordBoundary(t, t.length <= max ? budget : max)
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
