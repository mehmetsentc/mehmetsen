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
 * «kendini» ile yöntem fiili arasında yalnız araç / yer bildiren kelimeler (tabancayla, evinde,
 * av tüfeğiyle). «kendini savunmak için vurdu» gibi başka anlamlar eşleşmez.
 */
const MID = '(?:(?:av\\s+)?\\S+(?:yla|yle|la|le|nda|nde|da|de|ta|te)\\s+){0,2}'

/**
 * Sıra önemlidir: uzun kalıplar önce. Kalıplar KÜÇÜK HARF metin üzerinde
 * eşleşir (tr-TR küçültme uzunluğu korur), değiştirme özgün metne uygulanır.
 */
const WORDING: Rule[] = [
  // KULLANICI KARARI (26.11.2026): «ölü / ölüm / öldü / intihar» kelimeleri hiçbir yüzeyde (başlık,
  // açıklama, seslendirme, altyazı) kullanılmaz. Yerine «hayatını kaybetti», «hayatını kaybetmiş olarak
  // bulundu», «yaşamına son verdi», «kendine zarar verdi», «vefat», «can kaybı».
  [new RegExp(`${B}ölü\\s+(?:olarak\\s+)?bulundu(?:lar)?${E}`, 'gu'), 'hayatını kaybetmiş olarak bulundu'],
  [new RegExp(`${B}ölü\\s+(?:olarak\\s+)?bulunan(?:lar)?${E}`, 'gu'), 'hayatını kaybetmiş olarak bulunan'],
  [new RegExp(`${B}ölü\\s+(?:olarak\\s+)?bulunması${E}`, 'gu'), 'hayatını kaybetmiş olarak bulunması'],
  [new RegExp(`${B}cansız\\s+bedeni\\s+bulundu${E}`, 'gu'), 'hayatını kaybetmiş olarak bulundu'],
  [new RegExp(`${B}ölü\\s+sayısı${E}`, 'gu'), 'hayatını kaybedenlerin sayısı'],
  [new RegExp(`${B}ölü\\s+ve\\s+yaralı(?:lar)?${E}`, 'gu'), 'hayatını kaybeden ve yaralananlar'],
  [new RegExp(`${B}(\\d+)\\s+ölü${E}`, 'gu'), '$1 kişi hayatını kaybetti'],
  [new RegExp(`${B}kendini\\s+${MID}(?:vurarak|asarak|yakarak|bıçaklayarak|zehirleyerek|(?:köprüden|binadan|balkondan|pencereden|çatıdan|uçurumdan|boşluğa|denize|nehre|raylara)\\s+atarak)\\s+(?:intihar\\s+etti(?:ler)?|yaşamına\\s+son\\s+verdi|hayatına\\s+son\\s+verdi)${E}`, 'gu'), 'yaşamına son verdi'],
  [new RegExp(`${B}canına\\s+kıydı(?:lar)?${E}`, 'gu'), 'yaşamına son verdi'],
  [new RegExp(`${B}kendini\\s+${MID}(?:vurdu|astı|yaktı|bıçakladı|zehirledi)${E}`, 'gu'), 'kendine zarar verdi'],
  [new RegExp(`${B}kendini\\s+(?:köprüden|binadan|balkondan|pencereden|çatıdan|uçurumdan|boşluğa|denize|nehre|raylara)\\s+attı${E}`, 'gu'), 'kendine zarar verdi'],
  [new RegExp(`${B}intihara\\s+teşebbüs\\s+etti(?:ler)?${E}`, 'gu'), 'kendine zarar verdi'],
  [new RegExp(`${B}intihar\\s+girişiminde\\s+bulundu(?:lar)?${E}`, 'gu'), 'kendine zarar verdi'],
  [new RegExp(`${B}(?:başarısız\\s+(?:bir\\s+)?)?intihar\\s+(?:girişimi|teşebbüsü)${E}`, 'gu'), 'kendine zarar verme girişimi'],
  [new RegExp(`${B}intihar\\s+(?:salgını|dalgası)${E}`, 'gu'), 'yaşamına son verme vakalarındaki artış'],
  [new RegExp(`${B}intihar\\s+etti(?:ler)?${E}`, 'gu'), 'yaşamına son verdi'],
  [new RegExp(`${B}intihar\\s+ettiği${E}`, 'gu'), 'yaşamına son verdiği'],
  [new RegExp(`${B}intihar\\s+eden(?:ler)?${E}`, 'gu'), 'yaşamına son veren'],
  [new RegExp(`${B}intihara${E}`, 'gu'), 'yaşamına son vermeye'],
  [new RegExp(`${B}intiharı${E}`, 'gu'), 'yaşamına son vermesi'],
  [new RegExp(`${B}intiharın${E}`, 'gu'), 'yaşamına son vermesinin'],
  [new RegExp(`${B}intihardan${E}`, 'gu'), 'yaşamına son vermesinden'],
  [new RegExp(`${B}intihar${E}`, 'gu'), 'yaşamına son verme'],
  [new RegExp(`${B}can\\s+verdi(?:ler)?${E}`, 'gu'), 'hayatını kaybetti'],
  [new RegExp(`${B}öldürüldü(?:ler)?${E}`, 'gu'), 'hayatını kaybetti'],
  [new RegExp(`${B}öldürülen(?:ler)?${E}`, 'gu'), 'hayatını kaybeden'],
  [new RegExp(`${B}öldürülmesi${E}`, 'gu'), 'hayatını kaybetmesi'],
  [new RegExp(`${B}öldürülmüş${E}`, 'gu'), 'hayatını kaybetmiş'],
  [new RegExp(`${B}öldüler${E}`, 'gu'), 'hayatını kaybetti'],
  [new RegExp(`${B}öldü${E}`, 'gu'), 'hayatını kaybetti'],
  [new RegExp(`${B}ölmüştü${E}`, 'gu'), 'hayatını kaybetmişti'],
  [new RegExp(`${B}ölmüş${E}`, 'gu'), 'hayatını kaybetmiş'],
  [new RegExp(`${B}öldüğü${E}`, 'gu'), 'hayatını kaybettiği'],
  [new RegExp(`${B}öldüğünü${E}`, 'gu'), 'hayatını kaybettiğini'],
  [new RegExp(`${B}ölmesine${E}`, 'gu'), 'hayatını kaybetmesine'],
  [new RegExp(`${B}ölmesi${E}`, 'gu'), 'hayatını kaybetmesi'],
  [new RegExp(`${B}ölenlerin${E}`, 'gu'), 'hayatını kaybedenlerin'],
  [new RegExp(`${B}ölenler${E}`, 'gu'), 'hayatını kaybedenler'],
  [new RegExp(`${B}ölen${E}`, 'gu'), 'hayatını kaybeden'],
  [new RegExp(`${B}ölülerin${E}`, 'gu'), 'hayatını kaybedenlerin'],
  [new RegExp(`${B}ölüler${E}`, 'gu'), 'hayatını kaybedenler'],
  [new RegExp(`${B}ölünün${E}`, 'gu'), 'hayatını kaybedenin'],
  [new RegExp(`${B}ölümüne\\s+(neden|yol)\\s+(oldu|açtı)${E}`, 'gu'), 'hayatını kaybetmesine $1 $2'],
  [new RegExp(`${B}ölüme\\s+(neden|yol)\\s+(oldu|açtı)${E}`, 'gu'), 'can kaybına $1 $2'],
  [new RegExp(`${B}ölümlü${E}`, 'gu'), 'can kayıplı'],
  [new RegExp(`${B}ölümcül${E}`, 'gu'), 'can kaybına yol açan'],
  [new RegExp(`${B}ölümlerin${E}`, 'gu'), 'can kayıplarının'],
  [new RegExp(`${B}ölümlere${E}`, 'gu'), 'can kayıplarına'],
  [new RegExp(`${B}ölümler${E}`, 'gu'), 'can kayıpları'],
  [new RegExp(`${B}ölümüne${E}`, 'gu'), 'vefatına'],
  [new RegExp(`${B}ölümünü${E}`, 'gu'), 'vefatını'],
  [new RegExp(`${B}ölümünün${E}`, 'gu'), 'vefatının'],
  [new RegExp(`${B}ölümünden${E}`, 'gu'), 'vefatından'],
  [new RegExp(`${B}ölümüyle${E}`, 'gu'), 'vefatıyla'],
  [new RegExp(`${B}ölümü${E}`, 'gu'), 'vefatı'],
  [new RegExp(`${B}ölüme${E}`, 'gu'), 'vefata'],
  [new RegExp(`${B}ölümden${E}`, 'gu'), 'vefattan'],
  [new RegExp(`${B}ölümle${E}`, 'gu'), 'vefatla'],
  [new RegExp(`${B}ölümün${E}`, 'gu'), 'vefatın'],
  [new RegExp(`${B}ölüm${E}`, 'gu'), 'vefat'],
  [new RegExp(`${B}ölü${E}`, 'gu'), 'hayatını kaybetmiş'],
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

/**
 * HASSAS-VIDEO: elle paylaşım ENGELLENMEZ (kullanıcı kararı, 25.11.2026). Hassas haberde video
 * kurallara göre hazırlanır (nötr dil, yöntem yok, müzik yok, sakin sunuş) ve editöre bilgi verilir.
 */
export function isGraveNews(d: Record<string, unknown>): boolean {
  return sensitivityFromDoc(d).level >= 2
}

/**
 * Bilgi notu (engel değil). null = normal haber.
 * when 'before': onay ekranında («hazırlanacak»), 'after': paylaşım sonrası («hazırlandı»).
 */
export function sensitiveShareNotice(d: Record<string, unknown>, when: 'before' | 'after' = 'after'): string | null {
  const s = sensitivityFromDoc(d)
  const v = when === 'before' ? 'hazırlanacak' : 'hazırlandı'
  if (s.level >= 3)
    return `Hassas haber (${s.reasons.join(', ')}): paylaşım DSÖ ve RTÜK kurallarına göre ${v} — nötr dil, yöntem ve olay yeri anlatılmaz, müzik yok, sakin sunuş${s.reasons.includes('intihar') ? '; gönderi açıklamasına yardım satırı eklenir' : ''}. Platformlar yine de uyarı ekranı ya da yaş sınırı koyabilir.`
  if (s.level === 2) return `Ağır haber (ölüm / ağır şiddet): video müziksiz, sakin sunuşla ve nötr dille ${v}.`
  return null
}

/** Düzey 3 haber elle gönderi olarak paylaşılırsa açıklamanın sonuna eklenen yardım satırı. */
export const HELP_LINE_TEXT = 'Kendinizi zor durumda hissediyorsanız yalnız değilsiniz. Acil durumda 112\'yi, sosyal destek için ALO 183\'ü arayabilirsiniz.'

/** Açıklamaya yardım satırını bir kez ekler (düzey 3 intihar haberleri). */
export function withHelpLine(caption: string, d: Record<string, unknown>): string {
  const s = sensitivityFromDoc(d)
  if (s.level < 3 || !s.reasons.includes('intihar') || caption.includes('ALO 183')) return caption
  return `${caption.trimEnd()}\n\n${HELP_LINE_TEXT}`
}

export const SENSITIVE_BLOCK_TEXT: Record<'sensitive_blocked' | 'sensitive_format', string> = {
  sensitive_blocked: 'Hassas haber (intihar / çocuk mağdur / istismar) — otomatik paylaşılmaz; editör kurallara uygun biçimde elle paylaşabilir',
  sensitive_format: 'Hassas olay haberi (ölüm / ağır şiddet) — otomatik Reels ve hikâye üretilmez; yalnızca gönderi paylaşılır',
}

/**
 * KULLANICI KARARI (26.11.2026) — bütün yapay zekâ metin ve seslendirme talimatlarına
 * eklenen kesin ölüm/intihar dili kuralı. Tek kaynak: burada değiştir, her yere yansır.
 * Yazılı ve sesli çıktı ayrıca `neutralizeSocialText` ile son kez süzülür.
 */
export const DEATH_LANGUAGE_RULE =
  'KESİN YASAK KELİMELER (başlık, spot, metin, altyazı ve SESLENDİRME): «ölü», «öldü», «ölen», «ölüm», «ölümlü», «öldürüldü», «can verdi», «ceset», «intihar» ve bunların bütün ekli biçimleri ASLA kullanılmaz. ' +
  'Yerine: «hayatını kaybetti», «hayatını kaybetmiş olarak bulundu», «hayatını kaybeden», «X kişi hayatını kaybetti», «can kaybı», «vefat», «cansız beden»; ' +
  'intihar için «yaşamına son verdi», girişim için «kendine zarar verdi». Yöntem (silah, ip, ilaç, yükseklik, yer) anlatılmaz. Kaynakta bu kelimeler geçse de sen kullanma.'
