/**
 * AI-ROLE-1 — Kişi unvanı denetimi (kaynağa sadakat).
 *
 * Sorun: Yazar modeli (DeepSeek vb.) kişilerin görevini kendi eğitim bilgisinden
 * ekliyor. Bilgisi eski olduğu için kaynakta "Yeni Parti Genel Başkanı Özgür Özel"
 * ya da "eski Fenerbahçe Başkanı Ali Koç" yazsa bile çıktıya
 * "CHP Genel Başkanı Özgür Özel" / "Fenerbahçe Başkanı Ali Koç" yazabiliyor.
 *
 * Bu modül yapay zekâ çağırmaz. Çıktıdaki "<kurum> <unvan> <Ad Soyad>" ve
 * "<Kurum>'li <Ad Soyad>" kalıplarını bulur ve kaynak metinle karşılaştırır:
 *   - Unvan kaynakta aynı kişinin yanında geçiyorsa dokunmaz.
 *   - Kaynak "eski" diyorsa ve çıktı demiyorsa başına "eski" ekler.
 *   - Unvan kaynakta yoksa: kaynakta o kişi için başka bir unvan varsa onunla
 *     değiştirir, yoksa unvanı siler ve yalnızca adı bırakır.
 *
 * Saf fonksiyonlar; test: roleGuard.test.ts
 */

const UP = 'A-ZÇĞİÖŞÜÂÎÛ'
const LO = 'a-zçğıöşüâîû'

/** Unvan başları — uzundan kısaya (regex alternation sırası önemli). */
const ROLE_HEADS = [
  'Cumhurbaşkanı Yardımcısı',
  'Cumhurbaşkanı Başdanışmanı',
  'Cumhurbaşkanı',
  'Başbakan Yardımcısı',
  'Başbakanı',
  'Başbakan',
  'Genel Başkan Yardımcısı',
  'Genel Başkanvekili',
  'Genel Başkanı',
  'Başkan Yardımcısı',
  'Başkanvekili',
  'Başkanı',
  'Başkan',
  'Bakan Yardımcısı',
  'Bakanı',
  'Bakan',
  'Valisi',
  'Vali',
  'Kaymakamı',
  'Kaymakam',
  'Milletvekili',
  'Sözcüsü',
  'lideri',
  'Lideri',
  'Sportif Direktörü',
  'Teknik Direktörü',
  'Teknik Direktör',
  'Genel Müdürü',
  'Genel Sekreteri',
  'Rektörü',
  'Rektör',
  'Komutanı',
  "CEO'su",
  "CEO’su",
  'Kurucusu',
]

/** Birbirinin yerine geçebilen unvan kökleri ("CHP lideri" ≈ "CHP Genel Başkanı"). */
const HEAD_SYNONYMS: Record<string, string[]> = {
  lider: ['lider', 'başkan'],
  başkan: ['başkan', 'lider'],
}

/** Cümle başında büyük harfle gelen ama kurum adı olmayan sözcükler. */
const STOP_TOKENS = new Set(
  [
    'bu', 'şu', 'o', 'bir', 'dün', 'bugün', 'yarın', 'ayrıca', 'öte', 'ancak', 'ama', 'fakat',
    've', 'ile', 'daha', 'son', 'ilk', 'yeni', 'eski', 'önceki', 'sabık', 'da', 'de', 'ise',
    'hem', 'ya', 'ne', 'her', 'tüm', 'bütün', 'diğer', 'aynı', 'sonra', 'önce', 'açıklamada',
  ].map((s) => s.toLocaleLowerCase('tr-TR'))
)
// "Yeni" kurum adının parçası olabilir ("Yeni Parti"); yalnızca sağındaki sözcük de
// kurum sözcüğüyse anlamlıdır — bu kontrol significantQualifier içinde yapılır.

/** Kurum adının ardından gelen genel sözcükler ("Fenerbahçe Kulübü", "Yeni Parti"). */
const GENERIC_WORDS = new Set(
  [
    'kulübü', 'kulüp', 'spor', 'partisi', 'parti', 'genel', 'eş', 'yönetim', 'kurulu', 'belediye',
    'büyükşehir', 'il', 'ilçe', 'grup', 'merkez', 'bankası', 'holding', 'federasyonu', 'derneği',
    'odası', 'borsası', 'üniversitesi', 'bakanlığı', 'valiliği', 'meclisi', 'birliği', 'vakfı',
  ].map((s) => s.toLocaleLowerCase('tr-TR'))
)

const FORMER_RE = /^(?:eski|önceki|sabık)$/i

const lower = (s: string) => s.toLocaleLowerCase('tr-TR')

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const HEAD_ALT = ROLE_HEADS.map(escapeRe).join('|')
const NAME_WORD = `[${UP}][${LO}]+(?:-[${UP}][${LO}]+)?`
const NAME = `${NAME_WORD}(?:\\s+${NAME_WORD}){0,2}`
/** Kurum/nitelik sözcüğü: büyük harfle başlar (CHP, Fenerbahçe, Büyükşehir, CHP'nin) ya da "eski". */
const QUAL_TOKEN = `(?:[${UP}][${LO}${UP}0-9&.]*(?:['’][${LO}]+)?|eski|önceki)`
const NAME_END = `(?=['’\\s,.;:!?)"»\\]]|$)`

/** "<nitelik…> <unvan> <Ad Soyad>" */
const ROLE_RE = new RegExp(
  `((?:${QUAL_TOKEN}\\s+){0,6})(${HEAD_ALT})\\s+(${NAME})${NAME_END}`,
  'gu'
)
/** "<Kurum>'li <Ad Soyad>" — parti/kulüp bağlantısı */
const AFFIL_RE = new RegExp(
  `((?:eski\\s+)?)([${UP}][${LO}${UP}0-9]*['’](?:li|lı|lu|lü))\\s+(${NAME})${NAME_END}`,
  'gu'
)

export interface RoleMention {
  /** Eşleşmenin metindeki başlangıcı (silinecek/değişecek bölümün başı). */
  start: number
  /** Ad başlangıcı (unvan bölümü start..nameStart). */
  nameStart: number
  end: number
  name: string
  surname: string
  /** Metinde görünen unvan bölümü (ad hariç, sondaki boşluk hariç). */
  roleText: string
  headStem: string
  /** Anlamlı kurum sözcükleri (küçük harf kökleri). */
  qualifiers: string[]
  former: boolean
  kind: 'role' | 'affiliation'
}

export interface RoleFix {
  name: string
  from: string
  to: string
  action: 'removed' | 'replaced' | 'marked_former'
}

function stemOf(token: string): string {
  // Kesme işaretinden sonraki eki at: CHP'nin → chp, Fenerbahçe'nin → fenerbahçe
  const base = lower(token.split(/['’]/)[0] ?? token).replace(/[.]+$/, '')
  if (/^[a-zçğıöşü0-9&]+$/.test(base) && base.length <= 3) return base
  // Türkçe iyelik/hal ekleri yüzünden tam eşitlik yerine ilk 5 harf
  return base.slice(0, Math.max(3, Math.min(5, base.length)))
}

function headStemOf(head: string): string {
  const last = lower(head.split(/\s+/).pop() ?? head).split(/['’]/)[0] ?? ''
  if (last.startsWith('başkan')) return 'başkan'
  if (last.startsWith('cumhurbaşkan')) return 'cumhurbaşkan'
  if (last.startsWith('başbakan')) return 'başbakan'
  if (last.startsWith('bakan')) return 'bakan'
  if (last.startsWith('vali')) return 'vali'
  if (last.startsWith('kaymakam')) return 'kaymakam'
  if (last.startsWith('milletvekil')) return 'milletvekil'
  if (last.startsWith('sözcü')) return 'sözcü'
  if (last.startsWith('lider')) return 'lider'
  if (last.startsWith('direktör')) return 'direktör'
  if (last.startsWith('müdür')) return 'müdür'
  if (last.startsWith('sekreter')) return 'sekreter'
  if (last.startsWith('rektör')) return 'rektör'
  if (last.startsWith('komutan')) return 'komutan'
  if (last.startsWith('ceo')) return 'ceo'
  if (last.startsWith('kurucu')) return 'kurucu'
  if (last.startsWith('yardımcı')) return 'yardımcı'
  if (last.startsWith('başdanışman')) return 'başdanışman'
  return last.slice(0, 5)
}

/** Hal eki almış sözcük (Toplantıya, Ankara'da) kurum adı değildir. */
function hasCaseSuffix(token: string): boolean {
  if (/['’](?:da|de|ta|te|ya|ye|a|e|dan|den|tan|ten|la|le|yla|yle)$/i.test(token)) return true
  return false
}

function isSentenceInitial(text: string, idx: number): boolean {
  const before = text.slice(Math.max(0, idx - 3), idx)
  return idx === 0 || /(?:^|[.!?:\n])\s*$/.test(before) || /^\s*$/.test(text.slice(0, idx))
}

/**
 * Nitelik sözcüklerini sağdan sola (unvana en yakından başlayarak) ayıklar.
 * Kurum adı olmayan sözcüğe gelince durur; o sözcük ve solu metinde kalır.
 */
function significantQualifier(
  text: string,
  qualStart: number,
  qualRaw: string
): { tokens: string[]; offset: number; former: boolean } {
  const parts: Array<{ tok: string; at: number }> = []
  const re = /\S+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(qualRaw))) parts.push({ tok: m[0], at: qualStart + m.index })
  const kept: Array<{ tok: string; at: number }> = []
  let former = false
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]!
    const lw = lower(p.tok)
    if (FORMER_RE.test(p.tok)) {
      former = true
      kept.unshift(p)
      continue
    }
    if (hasCaseSuffix(p.tok)) break
    if (STOP_TOKENS.has(lw)) {
      // "Yeni Parti" gibi: sağında kurum sözcüğü varsa "Yeni" de kurum adının parçası
      if (lw === 'yeni' && kept.some((k) => !FORMER_RE.test(k.tok))) {
        kept.unshift(p)
        continue
      }
      break
    }
    // Cümle başındaki tek sözcük, hal eki taşımasa da fiil/zarf olabilir; büyük harfle
    // başlayan her sözcüğü kurum sayıyoruz — yanlış pozitifte unvan kaynağa göre
    // değiştirilir, metnin geri kalanı korunur.
    kept.unshift(p)
  }
  // Cümle başındaki ilk sözcük ("Açılışa", "Toplantıda") kurum adı olmayabilir.
  const lead = kept.findIndex((k) => !FORMER_RE.test(k.tok))
  if (lead >= 0 && isSentenceInitial(text, kept[lead]!.at) && !/^[A-ZÇĞİÖŞÜ]{2,}/.test(kept[lead]!.tok)) {
    const rest = kept.slice(lead + 1)
    const restStartsWithName = rest.length > 0 && !GENERIC_WORDS.has(lower(rest[0]!.tok))
    const locative = /(?:[dt][ae]n?|nd[ae]n?)$/i.test(kept[lead]!.tok)
    if (restStartsWithName || (rest.length === 0 && locative)) kept.splice(0, lead + 1)
  }
  // "eski" yalnızca en solda anlamlı
  const offset = kept.length ? kept[0]!.at : -1
  const tokens = kept.filter((k) => !FORMER_RE.test(k.tok)).map((k) => stemOf(k.tok))
  return { tokens, offset, former }
}

/** Metindeki unvanlı kişi anmalarını bulur. */
export function findRoleMentions(text: string): RoleMention[] {
  const out: RoleMention[] = []
  if (!text) return out
  ROLE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ROLE_RE.exec(text))) {
    const qualRaw = m[1] ?? ''
    const head = m[2] ?? ''
    const name = m[3] ?? ''
    const matchStart = m.index
    const headStart = matchStart + qualRaw.length
    const nameStart = text.indexOf(name, headStart + head.length)
    const q = significantQualifier(text, matchStart, qualRaw)
    const start = q.offset >= 0 ? q.offset : headStart
    const words = name.split(/\s+/)
    out.push({
      start,
      nameStart,
      end: nameStart + name.length,
      name,
      surname: words[words.length - 1]!,
      roleText: text.slice(start, nameStart).trim(),
      headStem: headStemOf(head),
      qualifiers: q.tokens,
      former: q.former,
      kind: 'role',
    })
    // Ad, sonraki eşleşmenin niteliği olamaz; adın sonundan devam et
    ROLE_RE.lastIndex = nameStart + name.length
  }
  AFFIL_RE.lastIndex = 0
  while ((m = AFFIL_RE.exec(text))) {
    const formerRaw = m[1] ?? ''
    const affil = m[2] ?? ''
    const name = m[3] ?? ''
    const start = m.index
    const nameStart = text.indexOf(name, start + formerRaw.length + affil.length)
    if (out.some((o) => o.nameStart === nameStart)) continue
    const words = name.split(/\s+/)
    out.push({
      start,
      nameStart,
      end: nameStart + name.length,
      name,
      surname: words[words.length - 1]!,
      roleText: text.slice(start, nameStart).trim(),
      headStem: stemOf(affil),
      qualifiers: [],
      former: Boolean(formerRaw.trim()),
      kind: 'affiliation',
    })
  }
  return out.sort((a, b) => a.start - b.start)
}

function surnameIndexes(srcLower: string, surname: string): number[] {
  const s = lower(surname)
  const idx: number[] = []
  if (s.length < 2) return idx
  let from = 0
  for (;;) {
    const i = srcLower.indexOf(s, from)
    if (i < 0) break
    const prev = i > 0 ? srcLower[i - 1]! : ' '
    if (!/[a-zçğıöşüâîû0-9]/.test(prev)) idx.push(i)
    from = i + s.length
  }
  return idx
}

function containsStem(window: string, stem: string): boolean {
  if (!stem) return true
  if (stem.length <= 3) {
    // kısaltmalar (chp, akp, mhp…) sözcük başında aranır
    return new RegExp(`(?:^|[^a-zçğıöşüâîû])${escapeRe(stem)}`, 'u').test(window)
  }
  return window.includes(stem)
}

interface SourceCheck {
  supported: boolean
  sourceFormer: boolean
}

/** Ad sözcükleri soyaddan geriye; ilk ad (tek başına çok yaygın) yalnızca tek sözcüklü adda. */
function nameKeys(m: RoleMention): string[] {
  const words = m.name.split(/\s+/)
  return words.length === 1 ? words : words.slice(1).reverse()
}

function checkAgainstSource(m: RoleMention, srcLower: string): SourceCheck {
  const heads = m.kind === 'affiliation' ? [m.headStem] : HEAD_SYNONYMS[m.headStem] ?? [m.headStem]
  let supported = false
  let sourceFormer = false
  // "Ahmet Yılmaz Antalya'da" gibi adın arkasına yapışan sözcük için tüm ad sözcükleri denenir
  const hits = nameKeys(m).flatMap((key) => surnameIndexes(srcLower, key).map((i) => ({ key, i })))
  for (const { key, i } of hits) {
    const pre = srcLower.slice(Math.max(0, i - 140), i)
    const post = srcLower.slice(i, i + key.length + 70)
    // Unvan adın hemen önünde ("… Başkanı Ali Koç") ya da appozisyonda ("Ali Koç, … başkanı")
    const near = pre.slice(-110) + ' ' + post
    const headOk = heads.some((h) => containsStem(near, h))
    if (!headOk) continue
    const qualOk = m.qualifiers.every((q) => containsStem(near, q))
    if (!qualOk) continue
    supported = true
    // "eski … Başkanı Ali Koç" — eski ile ad arasında cümle sınırı yoksa
    const formerMatch = pre.match(/(?:^|[^a-zçğıöşü])(?:eski|önceki|sabık)\s[^.!?;\n]{0,90}$/u)
    if (formerMatch && heads.some((h) => formerMatch[0].includes(h))) sourceFormer = true
    const appos = post.match(/^[^.!?;\n]{0,40},\s*(?:eski|önceki)\s/u)
    if (appos) sourceFormer = true
    if (sourceFormer) break
  }
  return { supported, sourceFormer }
}

/** Kaynakta aynı kişi için yazılmış unvan (değiştirme için). */
function sourceRoleFor(m: RoleMention, sourceMentions: RoleMention[]): string | null {
  const keys = new Set(nameKeys(m).map(lower))
  const hit = sourceMentions.find(
    (x) => x.kind === 'role' && x.roleText && x.name.split(/\s+/).some((w) => keys.has(lower(w)))
  )
  return hit ? hit.roleText : null
}

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : s
}

/**
 * Metindeki unvanları kaynağa göre düzeltir.
 * @param source Ham kaynak (başlık + özet + gövde; varsa canlı araştırma notu)
 */
export function guardRoles(text: string, source: string): { text: string; fixes: RoleFix[] } {
  const fixes: RoleFix[] = []
  if (!text || !source) return { text, fixes }
  const mentions = findRoleMentions(text)
  if (mentions.length === 0) return { text, fixes }
  const srcLower = lower(source)
  const sourceMentions = findRoleMentions(source)
  let out = text
  // Sondan başa düzelt ki indeksler kaymasın
  for (const m of [...mentions].reverse()) {
    const { supported, sourceFormer } = checkAgainstSource(m, srcLower)
    const initial = isSentenceInitial(out, m.start)
    if (supported) {
      if (sourceFormer && !m.former) {
        const prefix = initial ? 'Eski ' : 'eski '
        out = out.slice(0, m.start) + prefix + m.roleText + ' ' + out.slice(m.nameStart)
        fixes.push({ name: m.name, from: m.roleText, to: `eski ${m.roleText}`, action: 'marked_former' })
      }
      continue
    }
    const replacement = sourceRoleFor(m, sourceMentions)
    if (replacement) {
      const rep = initial ? capitalizeFirst(replacement) : replacement
      out = out.slice(0, m.start) + rep + ' ' + out.slice(m.nameStart)
      fixes.push({ name: m.name, from: m.roleText, to: replacement, action: 'replaced' })
    } else {
      out = out.slice(0, m.start) + out.slice(m.nameStart)
      fixes.push({ name: m.name, from: m.roleText, to: '', action: 'removed' })
    }
  }
  return { text: out, fixes }
}

/**
 * Bir haberin metin alanlarını birlikte düzeltir. Değişmeyen alanlar aynen döner.
 */
export function guardArticleRoles<K extends string>(
  fields: Partial<Record<K, string | undefined | null>>,
  source: string
): { fields: Partial<Record<K, string>>; fixes: RoleFix[] } {
  const next: Partial<Record<K, string>> = {}
  const fixes: RoleFix[] = []
  for (const key of Object.keys(fields) as K[]) {
    const v = fields[key]
    if (typeof v !== 'string' || !v) {
      if (typeof v === 'string') next[key] = v
      continue
    }
    const r = guardRoles(v, source)
    next[key] = r.text
    fixes.push(...r.fixes)
  }
  return { fields: next, fixes }
}

/** Log satırı — yalnızca kamuya açık ad/unvan, gizli değer yok. */
export function describeRoleFixes(fixes: RoleFix[]): string {
  return fixes
    .slice(0, 8)
    .map((f) =>
      f.action === 'removed'
        ? `${f.name}: «${f.from}» kaldırıldı`
        : f.action === 'replaced'
          ? `${f.name}: «${f.from}» → «${f.to}»`
          : `${f.name}: «eski» eklendi`
    )
    .join('; ')
}

/** Yazar talimatlarına eklenen kural (yazar, elle yazım, sosyal, Reels). */
export const ROLE_FIDELITY_RULES = `KİŞİ UNVANLARI — KESİN:
- Kişilerin görevini, unvanını, partisini, kulübünü ve kurumunu YALNIZCA kaynak metinden (ve verildiyse canlı araştırma notlarından) al.
- Kendi bilgin ESKİ olabilir: siyasetçilerin partisi ve parti başkanları, bakanlar, belediye başkanları, kulüp başkanları ve teknik direktörler sık değişir. Bildiğini sandığın unvanı ekleme.
- Kaynakta unvan yoksa kişiyi yalnızca adıyla yaz. Kaynak "eski" diyorsa "eski"yi koru. Kaynaktaki unvanı "düzeltme" ya da değiştirme.
- Kaynakta olmayan biyografik bilgi (memleketi, eski görevleri, hangi partiden olduğu, kaç yıldır görevde olduğu) ekleme.`
