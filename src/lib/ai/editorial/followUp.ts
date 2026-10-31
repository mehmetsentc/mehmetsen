/**
 * Tarih bilinci + takip (gelişme) haberi kipi — AI-FOLLOWUP-1.
 *
 * Sorun: Yazara hiç tarih verilmiyordu ve «takip haberi» kavramı yoktu.
 * 10 gün önceki kazanın yeni gelişmesinde (tutuklama, otopsi, iddianame …)
 * model ajans metnindeki «hatırlanacağı üzere» paragrafını yeni olay sayıp
 * manşete eski ölü sayısını koyuyor, yeni gelişmeyi geride bırakıyordu.
 *
 * Bu modül saf fonksiyonlardır (ağ / veritabanı yok):
 *   - bugünün ve kaynağın tarihi (Europe/Istanbul) talimat satırı,
 *   - kaynaktaki takip işaretleri,
 *   - daha önce yayımlanmış aynı olay haberlerini seçme (benzerlik),
 *   - yazar / sosyal / Reels için takip kuralları,
 *   - manşetin önceki haberi tekrar edip etmediği denetimi.
 */

const TZ = 'Europe/Istanbul'
const DAY_MS = 24 * 60 * 60 * 1000

/** «1 Kasım 2026 Pazar» */
export function formatTrDate(ms: number, withWeekday = false): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withWeekday ? { weekday: 'long' } : {}),
  }).format(new Date(ms))
}

export function toMillis(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const t = Date.parse(raw)
    return Number.isFinite(t) ? t : null
  }
  if (raw instanceof Date) return raw.getTime()
  if (raw && typeof raw === 'object') {
    const o = raw as { toMillis?: () => number; _seconds?: number; seconds?: number }
    if (typeof o.toMillis === 'function') return o.toMillis()
    const s = o._seconds ?? o.seconds
    if (typeof s === 'number') return s * 1000
  }
  return null
}

// ─────────────────────────────── takip işaretleri ───────────────────────────────

const tr = (s: string) => s.toLocaleLowerCase('tr-TR')
const B = '(?<![\\p{L}\\p{N}])'

/** Kaynağın bir önceki olaya atıf yaptığını gösteren kalıplar. */
const MARKERS: Array<[RegExp, string]> = [
  [new RegExp(`${B}hatırlanacağı\\s+(?:üzere|gibi)`, 'u'), 'hatırlanacağı üzere'],
  [new RegExp(`${B}(?:olaya|olayına|kazaya|kazasına|cinayete|cinayetine|saldırıya|saldırısına|yangına|yangınına|soruşturmaya|soruşturmasına)\\s+ilişkin`, 'u'), 'olaya ilişkin'],
  [new RegExp(`${B}olayla\\s+ilgili\\s+(?:yürütülen|başlatılan)`, 'u'), 'yürütülen soruşturma'],
  [new RegExp(`${B}soruşturma\\s+kapsamında`, 'u'), 'soruşturma kapsamında'],
  [new RegExp(`${B}(?:iddianame|tutuklandı|tutuklanarak|adli\\s+kontrol|otopsi\\s+raporu|bilirkişi\\s+raporu|taburcu|toprağa\\s+verildi|cenaze\\s+töreni|son\\s+yolculuğuna|hakim\\s+karşısına|ilk\\s+duruşma|karar\\s+duruşması|hapis\\s+cezası)`, 'u'), 'yargı / sağlık / cenaze gelişmesi'],
  [new RegExp(`${B}(?:\\d{1,2})\\s+gün\\s+(?:önce|sonra)`, 'u'), 'gün önce/sonra'],
  [new RegExp(`${B}geçen\\s+(?:hafta|ay)`, 'u'), 'geçen hafta/ay'],
  [new RegExp(`${B}(?:hayatını\\s+kaybeden|yaralanan|öldürülen)\\s+[\\p{L}.\\s]{0,40}?(?:için|ailesi|cenazesi)`, 'u'), 'mağdur yakınları'],
]

/** Kaynakta takip işareti var mı (başlık + ilk 3000 karakter). */
export function followUpMarkers(title: string, body: string): string[] {
  const text = tr(`${title} ${body.slice(0, 3000)}`)
  const out: string[] = []
  for (const [re, label] of MARKERS) if (re.test(text) && !out.includes(label)) out.push(label)
  return out
}

// ─────────────────────────────── ilgili haberler ───────────────────────────────

const STOP = new Set([
  've', 'ile', 'bir', 'bu', 'şu', 'o', 'için', 'de', 'da', 'den', 'dan', 'ki', 'mi', 'gibi', 'olan', 'oldu', 'olarak',
  'sonra', 'önce', 'kadar', 'daha', 'en', 'çok', 'ise', 'ama', 'ancak', 'yeni', 'son', 'dakika', 'haber', 'haberi',
  'tarafından', 'üzerine', 'nedeniyle', 'sırasında', 'yaşındaki', 'kişi', 'iki', 'üç', 'dört', 'beş',
])

/** Basit Türkçe kök: «Küçükçekmece'de» → «küçükçekmece», «motosikletli» → «motosiklet» (ilk 7 harf). */
export function topicTokens(s: string): Set<string> {
  const out = new Set<string>()
  for (const raw of tr(s).replace(/['’`]/g, ' ').split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3 || STOP.has(raw) || /^\d+$/.test(raw)) continue
    out.add(raw.slice(0, 7))
  }
  return out
}

export function topicSimilarity(a: string, b: string): number {
  const A = topicTokens(a)
  const Bt = topicTokens(b)
  if (A.size === 0 || Bt.size === 0) return 0
  let inter = 0
  for (const t of A) if (Bt.has(t)) inter++
  // Kısa manşetler arasında Jaccard yerine küçük kümeye göre örtüşme.
  return inter / Math.min(A.size, Bt.size)
}

export interface RelatedNewsCandidate {
  id: string
  title: string
  summary: string
  publishedAt: number | null
}

export interface RelatedNews extends RelatedNewsCandidate {
  similarity: number
}

export const RELATED_LOOKBACK_DAYS = 30
export const RELATED_MIN_SIMILARITY = 0.5
/** Aynı haberin kopyası (son birkaç saat) takip sayılmaz — tekrar tespiti ayrıdır. */
const RELATED_MIN_AGE_MS = 6 * 60 * 60 * 1000

/**
 * Daha önce yayımlanmış aynı olay haberleri (en fazla 3, en benzer önce).
 * Benzerlik başlık + özet konu kelimeleri üzerinden; en az 2 ortak kelime şart.
 */
export function pickRelatedNews(
  candidates: RelatedNewsCandidate[],
  input: { title: string; body: string; now: number },
  max = 3,
): RelatedNews[] {
  const probe = `${input.title} ${input.body.slice(0, 600)}`
  const probeTokens = topicTokens(probe)
  const out: RelatedNews[] = []
  for (const c of candidates) {
    if (c.publishedAt == null) continue
    const age = input.now - c.publishedAt
    if (age < RELATED_MIN_AGE_MS || age > RELATED_LOOKBACK_DAYS * DAY_MS) continue
    const cTokens = topicTokens(`${c.title} ${c.summary}`)
    let inter = 0
    for (const t of cTokens) if (probeTokens.has(t)) inter++
    if (inter < 2) continue
    const sim = Math.max(topicSimilarity(input.title, c.title), inter / Math.min(cTokens.size, probeTokens.size || 1))
    if (sim >= RELATED_MIN_SIMILARITY) out.push({ ...c, similarity: Math.round(sim * 100) / 100 })
  }
  return out.sort((a, b) => b.similarity - a.similarity).slice(0, max)
}

// ─────────────────────────────── talimat blokları ───────────────────────────────

export interface EditorialTimeContext {
  now: number
  sourcePublishedAt?: number | null
}

/** Her yazıma eklenen tarih satırları. */
export function timeContextBlock(c: EditorialTimeContext): string {
  const lines = [
    'ZAMAN BİLGİSİ (Europe/Istanbul):',
    `- Bugün: ${formatTrDate(c.now, true)}`,
  ]
  if (c.sourcePublishedAt && Number.isFinite(c.sourcePublishedAt)) {
    lines.push(`- Kaynağın yayın tarihi: ${formatTrDate(c.sourcePublishedAt)}`)
  }
  lines.push(
    '- Kaynakta bugünden ÖNCEKİ bir tarihe ait olay GEÇMİŞTİR: onu geçmiş zamanla ve tarihiyle an ("20 Ekim\'de meydana gelen kazada…"). Geçmiş bir olayı bugün olmuş gibi yazma.',
    '- "Dün", "bugün", "geçen hafta" yerine gün ve ay yaz.',
  )
  return lines.join('\n')
}

/** Takip haberi kuralları (yazar). */
export const FOLLOW_UP_WRITER_RULES = `TAKİP (GELİŞME) HABERİ — bu kaynak daha önce yaşanmış bir olayın YENİ GELİŞMESİDİR:
- Haberin konusu YENİ GELİŞMEDİR (tutuklama, rapor, karar, açıklama, cenaze, taburcu vb.). Ana olay haberin konusu DEĞİLDİR.
- title (manşet) YENİ GELİŞMEYİ söyler. Eski olayın ölü/yaralı sayısını, "çarpıştı", "öldü" gibi ilk gün olgusunu manşete KOYMA.
  İYİ: "Küçükçekmece'deki kazada otomobil sürücüsü tutuklandı"
  KÖTÜ: "Küçükçekmece'de motosiklet otomobille çarpıştı: 21 yaşındaki sürücü öldü"
- spot ve ilk paragraf YALNIZCA yeni gelişmeyi anlatır: kim, ne karar verdi / ne açıkladı, ne zaman.
- Ana olayı yalnızca gövdenin SONUNDA "## Olayın Geçmişi" alt başlığı altında, EN FAZLA 3 cümleyle, tarihiyle ve geçmiş zamanla hatırlat.
- Kaynaktaki "hatırlanacağı üzere…" paragrafını yeni bilgi sayma; yalnızca hatırlatma bölümünde kullan.
- UZUNLUK: Bu kural genel uzunluk hedefini ezer. Yeni gelişmeyi tam ve doğru anlatacak kadar yaz (hedef 220-380 kelime). Kelime sayısını doldurmak için ana olayı yeniden anlatma; hatırlatma bölümünü uzatma.`

export function relatedNewsBlock(related: RelatedNews[]): string {
  if (related.length === 0) return ''
  const rows = related.map((r) => `- ${r.publishedAt ? formatTrDate(r.publishedAt) : 'tarih yok'}: ${r.title}${r.summary ? ` — ${r.summary.slice(0, 160)}` : ''}`)
  return [
    'DAHA ÖNCE YAYIMLADIĞIMIZ AYNI OLAY HABERLERİ (okur bunları biliyor; yeniden anlatma, yalnızca hatırlatma bölümünde kısaca an):',
    ...rows,
  ].join('\n')
}

export interface FollowUpContext {
  isFollowUp: boolean
  markers: string[]
  related: RelatedNews[]
  /** Yazar sistem talimatına eklenecek blok (tarih + gerekiyorsa takip kuralları). */
  block: string
}

export function buildFollowUpContext(input: {
  now: number
  sourcePublishedAt?: number | null
  title: string
  body: string
  related: RelatedNews[]
}): FollowUpContext {
  const markers = followUpMarkers(input.title, input.body)
  const isFollowUp = input.related.length > 0 || markers.length > 0
  const parts = [timeContextBlock({ now: input.now, sourcePublishedAt: input.sourcePublishedAt })]
  if (isFollowUp) {
    parts.push(FOLLOW_UP_WRITER_RULES)
    const rb = relatedNewsBlock(input.related)
    if (rb) parts.push(rb)
  }
  return { isFollowUp, markers, related: input.related, block: parts.join('\n\n') }
}

/** Takip haberinin manşeti önceki haberlerden birini tekrarlıyor mu? */
export const HEADLINE_REPEAT_THRESHOLD = 0.6
export function headlineRepeatsPrevious(title: string, previousTitles: string[]): boolean {
  return previousTitles.some((p) => topicSimilarity(title, p) >= HEADLINE_REPEAT_THRESHOLD)
}

export const HEADLINE_REPEAT_REASON = 'takip haberi: manşet önceki haberi tekrarlıyor — manşete ve spota yeni gelişmeyi yaz, ana olayı yalnızca "Olayın Geçmişi" bölümünde kısaca hatırlat'

// ─────────────────────────────── sosyal + Reels ───────────────────────────────

/** Gövdeden «Olayın Geçmişi» hatırlatma bölümünü ayırır (markdown / HTML başlığı). */
export function splitBackgroundSection(content: string): { main: string; background: string } {
  const re = /(?:(?:^|\n)\s*#{2,3}\s*|<h[23][^>]*>\s*)(olayın\s+geçmişi|olayın\s+arka\s+planı|geçmişte\s+ne\s+olmuştu|hatırlatma)\b[^\n]*/iu
  const m = re.exec(content)
  if (!m) return { main: content, background: '' }
  return { main: content.slice(0, m.index).trim(), background: content.slice(m.index).trim() }
}

/** Sosyal editör + Reels için ortak sunucu ve takip kuralları. */
export const PRESENTER_RULES = `SUNUŞ: Tarafsız, profesyonel bir haber sunucusu gibi anlat. Yorum, taraf tutma, duygu sömürüsü, merak tuzağı yok; olguyu sade ve anlaşılır ver, bilgiyi sahibine atfet.
TAKİP HABERİ: Haber daha önce yaşanmış bir olayın yeni gelişmesiyse (tutuklama, rapor, karar, cenaze vb.) önce YENİ GELİŞMEYİ anlat; ana olayı en fazla tek cümleyle, tarihiyle ve geçmiş zamanla hatırlat. Eski olayı yeni olmuş gibi anlatma.`
