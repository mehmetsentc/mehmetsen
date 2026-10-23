/**
 * Hassas haber dili ve hassasiyet düzeyi (SOCIAL-SENS-1).
 *
 * Yalnızca SOSYAL PAYLAŞIMLAR içindir (görsel üstü manşet, açıklama,
 * hashtag, Reels metni / sesi, YouTube başlığı). nahaber.com'daki haber
 * metnine dokunulmaz.
 *
 * Neden: Instagram / Facebook öneri kuralları ölüm, şiddet ve intihar
 * içeriklerini takip etmeyenlere önermez; bu içerikleri sürekli paylaşan
 * hesabın tamamı da önerilmez. Nötr haber dili hem profesyonel yayıncılık
 * standardı hem de «sansasyonel» sinyalini azaltır. Kelimeleri yıldızla
 * maskelemek (in**ar) bilinçli olarak YAPILMAZ: Meta'nın sınıflandırıcıları
 * metni, görseli ve sesi birlikte okur; maskeleme güvenilirliği düşürür.
 *
 * Kurallar deterministiktir (yapay zekâya bırakılmaz) ve büyük/küçük harf
 * biçimini korur: «ÖLDÜ» → «HAYATINI KAYBETTİ», «Öldü» → «Hayatını kaybetti».
 */

const tr = (s: string) => s.toLocaleLowerCase('tr-TR')
const up = (s: string) => s.toLocaleUpperCase('tr-TR')

/** Türkçe harf sınırları (ASCII \b Türkçe harflerde güvenilir değil). */
const B = '(?<![\\p{L}\\p{N}])'
const E = '(?![\\p{L}\\p{N}])'

type Rule = [RegExp, string]

/**
 * Sıra önemlidir: uzun kalıplar önce. Kalıplar KÜÇÜK HARF metin üzerinde
 * eşleşir (tr-TR küçültme uzunluğu korur), değiştirme özgün metne uygulanır.
 */
const WORDING: Rule[] = [
  // ölü bulundu / cansız
  [new RegExp(`${B}ölü\\s+(olarak\\s+)?bulundu(lar)?${E}`, 'gu'), 'hayatını kaybetmiş halde bulundu'],
  [new RegExp(`${B}ölü\\s+sayısı${E}`, 'gu'), 'hayatını kaybedenlerin sayısı'],
  // «2 ölü», «2 ölü 3 yaralı»
  [new RegExp(`${B}(\\d+)\\s+ölü${E}`, 'gu'), '$1 kişi hayatını kaybetti'],
  [new RegExp(`${B}intihar\\s+etti(ler)?${E}`, 'gu'), 'hayatını kaybetti'],
  [new RegExp(`${B}can\\s+verdi(ler)?${E}`, 'gu'), 'hayatını kaybetti'],
  [new RegExp(`${B}öldüler${E}`, 'gu'), 'hayatını kaybetti'],
  [new RegExp(`${B}öldü${E}`, 'gu'), 'hayatını kaybetti'],
  [new RegExp(`${B}ölmüştü${E}`, 'gu'), 'hayatını kaybetmişti'],
  [new RegExp(`${B}ölmüş${E}`, 'gu'), 'hayatını kaybetmiş'],
  [new RegExp(`${B}öldüğü${E}`, 'gu'), 'hayatını kaybettiği'],
  [new RegExp(`${B}öldüğünü${E}`, 'gu'), 'hayatını kaybettiğini'],
  [new RegExp(`${B}ölenlerin${E}`, 'gu'), 'hayatını kaybedenlerin'],
  [new RegExp(`${B}ölenler${E}`, 'gu'), 'hayatını kaybedenler'],
  [new RegExp(`${B}ölen${E}`, 'gu'), 'hayatını kaybeden'],
  // ceset → cansız beden
  [new RegExp(`${B}cesetler${E}`, 'gu'), 'cansız bedenler'],
  [new RegExp(`${B}cesedine${E}`, 'gu'), 'cansız bedenine'],
  [new RegExp(`${B}cesedini${E}`, 'gu'), 'cansız bedenini'],
  [new RegExp(`${B}cesedinin${E}`, 'gu'), 'cansız bedeninin'],
  [new RegExp(`${B}cesedi${E}`, 'gu'), 'cansız bedeni'],
  [new RegExp(`${B}ceset${E}`, 'gu'), 'cansız beden'],
  // sansasyonel sıfatlar
  [new RegExp(`${B}kan\\s+donduran\\s+`, 'gu'), ''],
  [new RegExp(`${B}dehşet\\s+anları${E}`, 'gu'), 'zor anlar'],
  [new RegExp(`${B}dehşete\\s+düşüren\\s+`, 'gu'), ''],
  [new RegExp(`${B}vahşet${E}`, 'gu'), 'olay'],
]

function matchCase(original: string, replacement: string): string {
  if (!replacement) return replacement
  const letters = original.replace(/[^\p{L}]/gu, '')
  if (letters.length > 1 && letters === up(letters)) return up(replacement)
  const first = original.match(/\p{L}/u)?.[0]
  if (first && first === up(first) && first !== tr(first)) {
    return up(replacement.charAt(0)) + replacement.slice(1)
  }
  return replacement
}

function applyRule(text: string, [re, rep]: Rule): string {
  const lower = tr(text)
  // tr-TR küçültme Türkçe metinde uzunluğu korur; korumuyorsa dokunma.
  if (lower.length !== text.length) return text
  re.lastIndex = 0
  let out = ''
  let last = 0
  let capNextAt = -1
  for (const m of lower.matchAll(re)) {
    const start = m.index ?? 0
    const end = start + m[0].length
    const orig = text.slice(start, end)
    const replaced = m[0].replace(new RegExp(re.source, 'u'), rep)
    out += text.slice(last, start) + matchCase(orig, replaced)
    // Cümle başındaki ifade silindiyse sonraki kelime büyük harfle başlar.
    if (!replaced && /^\p{Lu}/u.test(orig)) capNextAt = out.length
    last = end
  }
  if (last === 0) return text
  out += text.slice(last)
  if (capNextAt >= 0 && capNextAt < out.length) out = out.slice(0, capNextAt) + up(out.charAt(capNextAt)) + out.slice(capNextAt + 1)
  return out
}

/** Paylaşımda kullanılmayan hashtag'ler (#cinayet, #intihar …). */
/** Küçük harf (tr-TR) metinde eşleşir. */
const BANNED_TAG_RE = /#(?:cinayet|intihar|uyuşturucu|uyusturucu|ölüm|olum|ölü|ceset|vahşet|vahset|katliam|kan(?![a-zçğıöşü]))[\p{L}\p{N}_]*/gu

function removeBannedTags(text: string): string {
  const lower = tr(text)
  if (lower.length !== text.length) return text
  let out = ''
  let last = 0
  for (const m of lower.matchAll(BANNED_TAG_RE)) {
    out += text.slice(last, m.index)
    last = (m.index ?? 0) + m[0].length
  }
  return last === 0 ? text : out + text.slice(last)
}

/**
 * Sosyal metni nötr haber diline çevirir. Metnin geri kalanına (URL, sayı,
 * özel isim) dokunmaz. Boş / kural dışı metin aynen döner.
 */
const URL_RE = /(https?:\/\/\S+|www\.\S+)/gi

export function neutralizeSocialText(input: string): string {
  if (!input) return input
  // Bağlantılar (haber adresindeki «ceset-bulundu» gibi slug'lar) değiştirilmez.
  if (URL_RE.test(input)) {
    URL_RE.lastIndex = 0
    return input
      .split(URL_RE)
      .map((part, i) => (i % 2 === 1 ? part : neutralizePlain(part)))
      .join('')
  }
  return neutralizePlain(input)
}

function neutralizePlain(input: string): string {
  if (!input.trim()) return input
  let t = input
  for (const rule of WORDING) t = applyRule(t, rule)
  t = removeBannedTags(t)
  // «hayatını kaybetti hayatını kaybetti» gibi çift ifade / boşluk temizliği
  t = t.replace(/(hayatını kaybetti)(\s+\1)+/giu, '$1')
  if (t === input) return input
  // Yalnız iç boşlukları toparla; parçanın baş/son boşluğu (bağlantı komşuluğu) korunur.
  const lead = input.match(/^\s*/)![0]
  const trail = input.match(/\s*$/)![0]
  const core = t.trim().replace(/[ \t]{2,}/g, ' ').replace(/ +\n/g, '\n').replace(/\n +/g, '\n')
  return lead + core + trail
}

/** Hashtag listesinden hassas etiketleri çıkarır. */
export function neutralizeHashtags(tags: string[]): string[] {
  return tags.filter((t) => {
    const s = String(t).trim()
    return !!s && removeBannedTags(s.startsWith('#') ? s : `#${s}`).trim() !== ''
  })
}

// ─────────────────────────────── hassasiyet düzeyi ───────────────────────────────

/**
 * 0 normal · 1 hassas dil · 2 hassas olay (ölüm / ağır şiddet)
 * 3 otomatik paylaşılmaz (intihar, çocuk mağdur, cinsel suç / istismar)
 */
export type SensitivityLevel = 0 | 1 | 2 | 3

export interface Sensitivity {
  level: SensitivityLevel
  reasons: string[]
}

const W = (src: string) => new RegExp(`${B}(?:${src})`, 'u')

const LEVEL3: Array<[RegExp, string]> = [
  [W('intihar|kendini\\s+(?:as|astı|vurdu|yaktı)|canına\\s+kıy|yaşamına\\s+son\\s+ver|hayatına\\s+son\\s+ver'), 'intihar'],
  [W('cinsel\\s+(?:istismar|saldırı|taciz)|tecavüz|istismar\\s+etti|istismara\\s+uğra|çocuk\\s+istismar'), 'cinsel suç / istismar'],
]
const CHILD = W('çocuk|bebek|minik(?![\\p{L}])')
const CHILD_AGE = /(?<![\p{L}\p{N}])([1-9]|1[0-7])\s+yaşındaki/u
const DEATH = W('öldü|ölü(?![\\p{L}])|ölen|ölüm|hayatını\\s+kaybet|yaşamını\\s+yitir|can\\s+verdi|ceset|cesed|cansız\\s+beden|öldürül|katledil')
const VIOLENCE = W('cinayet|öldürül|katil|silahlı\\s+saldırı|bıçak|kurşun|vurul|darp|linç|boğazı|yaralandı|şiddet')
const LEVEL1 = W('kaza|yaralı|yaralandı|gözaltı|tutuklan|uyuşturucu|uyuşturucu|narkotik|operasyon|yangın|kavga|darp|silah|hırsız|gasp|dolandırıc|yakalandı')

/** Haber başlığı + gövdesinden (ilk ~2000 karakter) hassasiyet düzeyi. */
export function classifySensitivity(input: { title?: string; summary?: string; body?: string }): Sensitivity {
  const title = tr(input.title ?? '')
  const text = tr(`${input.title ?? ''} ${input.summary ?? ''} ${(input.body ?? '').slice(0, 2000)}`)
  const reasons: string[] = []
  for (const [re, why] of LEVEL3) if (re.test(text)) reasons.push(why)
  const child = CHILD.test(title) || CHILD_AGE.test(title)
  const harm = DEATH.test(text) || W('darp|dövül|şiddet|istismar|kaçırıl').test(text)
  if (child && harm) reasons.push('çocuk mağdur')
  if (reasons.length) return { level: 3, reasons }
  if (DEATH.test(text)) return { level: 2, reasons: ['ölüm'] }
  if (W('cinayet|öldürül|silahlı\\s+saldırı|bıçaklı\\s+saldırı|linç|katledil').test(text)) return { level: 2, reasons: ['ağır şiddet'] }
  if (LEVEL1.test(text) || VIOLENCE.test(text)) return { level: 1, reasons: ['asayiş / kaza'] }
  return { level: 0, reasons: [] }
}

/** Haber belgesinden düzey (CMS alanları: title, spot/summary, content/bodyBlocks). */
export function sensitivityFromDoc(d: Record<string, unknown>): Sensitivity {
  const s = (v: unknown) => (typeof v === 'string' ? v : '')
  const blocks = Array.isArray(d.bodyBlocks)
    ? (d.bodyBlocks as Array<Record<string, unknown>>).map((b) => s(b?.text)).join(' ')
    : ''
  const body = (s(d.content) || s(d.body) || blocks).replace(/<[^>]+>/g, ' ')
  // Editör kararı her zaman önce gelir.
  const manual = d.socialSensitivity
  if (manual === 0 || manual === 1 || manual === 2 || manual === 3) return { level: manual, reasons: ['editör kararı'] }
  return classifySensitivity({ title: s(d.title), summary: s(d.spot) || s(d.summary), body })
}

/** Otomatik paylaşımda bu biçim bu düzeyde yapılabilir mi? null = evet. */
export function automationSensitivityBlock(level: SensitivityLevel, format: string): 'sensitive_blocked' | 'sensitive_format' | null {
  if (level >= 3) return 'sensitive_blocked'
  if (level === 2 && format !== 'post') return 'sensitive_format'
  return null
}

export const SENSITIVE_BLOCK_TEXT: Record<'sensitive_blocked' | 'sensitive_format', string> = {
  sensitive_blocked: 'Hassas haber (intihar / çocuk mağdur / istismar) — otomatik paylaşılmaz; editör kurallara uygun biçimde elle paylaşabilir',
  sensitive_format: 'Hassas olay haberi (ölüm / ağır şiddet) — otomatik Reels ve hikâye üretilmez; yalnızca gönderi paylaşılır',
}
