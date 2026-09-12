/**
 * Deterministic evidence-grounding flags. FLAG FOR REVIEW — not auto-reject.
 * Reuses number/quote helpers and crawler named-token extraction. No LLM judge.
 */
import { namedTokensFrom } from '@/services/crawler/cluster/fingerprint'
import { extractNumbers, extractQuotes } from './abSafety'

export type EvidenceGroundingReport = {
  unsupportedNumbers: string[]
  unsupportedNamedEntities: string[]
  unsupportedQuotes: string[]
  lexicalInflations: string[]
  certaintyShifts: string[]
  claimAttributionMissing: boolean
  reviewFlags: string[]
}

const GENERIC_NAMED = new Set([
  'haber',
  'haberler',
  'türkiye',
  'turkiye',
  'ankara',
  'istanbul',
  'bakan',
  'bakanı',
  'bakanlik',
  'açıklama',
  'açiklama',
  'kaynak',
  'yetkili',
  'yetkililer',
  'kamuoyu',
  'dünya',
  'dunya',
])

const INFLATION_LEXICON: Array<{ id: string; re: RegExp }> = [
  { id: 'host_status', re: /ev sahibi/i },
  { id: 'pipeline_tanap', re: /\bTANAP\b/ },
  { id: 'pipeline_btc', re: /Bakü-Tiflis-Ceyhan|Bakü-Tiflis-Erzurum|\bBTC\b/i },
  { id: 'hazar_corridor', re: /Hazar Denizi/i },
  { id: 'icty', re: /\bICTY\b|Uluslararası Ceza Mahkemesi/i },
  { id: 'life_sentence', re: /müebbet hapis/i },
  { id: 'srebrenica_toll', re: /8 binden fazla/i },
  { id: 'srebrenica_year', re: /\b1995\b/ },
  { id: 'july_11', re: /11 Temmuz/i },
  { id: 'tesla_spacex', re: /\bTesla\b|\bSpaceX\b/ },
  { id: 'eu_ai_act', re: /Yapay Zeka Yasas/i },
  { id: 'us_bills', re: /yasa teklifleri/i },
  { id: 'ceremony_family', re: /ailelerin ve yakın|yakın dostların katılım/i },
  { id: 'social_media_reaction', re: /sosyal medyada (takipçiler|paylaşıldı|tebrik)/i },
  { id: 'implemented_classes', re: /derslere girdi|derslerine girdi/i },
]

const CERTAINTY_SHIFTS: Array<{ id: string; fromEvidence: RegExp; toGenerated: RegExp }> = [
  {
    id: 'plan_to_implemented',
    fromEvidence: /planlanıyor|amaçlıyor|ele alınıyor|entegre ediliyor|hedefleniyor/i,
    toGenerated: /entegre edildi|derslere girdi|derslerine girdi|uygulamaya geçti|müfredata girdi/i,
  },
  {
    id: 'warrant_to_arrested',
    fromEvidence: /gözaltı kararı/i,
    toGenerated: /gözaltına alındı/i,
  },
  {
    id: 'expected_hike',
    fromEvidence: /zam bekleniyor/i,
    toGenerated: /zam geldi|zam yapıldı/i,
  },
  {
    id: 'talks_to_deal',
    fromEvidence: /görüşülüyor/i,
    toGenerated: /anlaşma sağlandı/i,
  },
  {
    id: 'target_to_started',
    fromEvidence: /hedefleniyor/i,
    toGenerated: /\bbaşladı\b/i,
  },
]

function combinedGenerated(generated: { title: string; spot: string; content: string }): string {
  return `${generated.title}\n${generated.spot}\n${generated.content}`
}

function sourceHas(sourceNorm: string, raw: string): boolean {
  const needle = raw.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  if (!needle) return true
  return sourceNorm.includes(needle)
}

export function flagLexicalInflations(source: string, generated: string): string[] {
  const sourceNorm = source.toLocaleLowerCase('tr-TR')
  const hits: string[] = []
  for (const item of INFLATION_LEXICON) {
    if (item.re.test(generated) && !item.re.test(source)) hits.push(item.id)
  }
  void sourceNorm
  return hits
}

export function detectCertaintyShifts(source: string, generatedHeadlineLead: string): string[] {
  const hits: string[] = []
  for (const shift of CERTAINTY_SHIFTS) {
    if (shift.fromEvidence.test(source) && shift.toGenerated.test(generatedHeadlineLead)) {
      hits.push(shift.id)
    }
  }
  return hits
}

export function claimAttributionMissing(source: string, title: string, spot: string, lead: string): boolean {
  const ev = source.toLocaleLowerCase('tr-TR')
  if (!/iddia etti|öne sürdü|iddia ediyor|iddia niteliği/.test(ev)) return false
  const head = `${title}\n${spot}\n${lead}`.toLocaleLowerCase('tr-TR')
  const attributed =
    /iddia etti|öne sürdü|öne sür|iddia ediyor|['"]e göre|['']e göre|:/.test(head) ||
    /\b(husiler|yetkili|sözcü|bakan)[^.]{0,40}:/.test(head)
  if (attributed) return false
  return /saldırı düzenledi|düzenlediler|hedef aldı/.test(head)
}

export function flagEvidenceMismatches(opts: {
  source: string
  generated: { title: string; spot: string; content: string }
}): EvidenceGroundingReport {
  const combined = combinedGenerated(opts.generated)
  const sourceNorm = opts.source.toLocaleLowerCase('tr-TR')
  const sourceNumbers = new Set(extractNumbers(opts.source))
  const unsupportedNumbers = extractNumbers(combined).filter((n) => !sourceNumbers.has(n))

  const sourceNamed = new Set(namedTokensFrom(opts.source, 'tr'))
  const genNamed = namedTokensFrom(`${opts.generated.title} ${opts.generated.spot}`, 'tr')
  const unsupportedNamedEntities = genNamed.filter((token) => {
    if (GENERIC_NAMED.has(token)) return false
    if (sourceNamed.has(token)) return false
    if (sourceHas(sourceNorm, token)) return false
    return token.length >= 4
  })

  const sourceQuotes = new Set(extractQuotes(opts.source).map((q) => q.toLocaleLowerCase('tr-TR')))
  const unsupportedQuotes = extractQuotes(combined).filter((q) => {
    const n = q.toLocaleLowerCase('tr-TR')
    if (sourceQuotes.has(n)) return false
    return !sourceNorm.includes(n.slice(0, Math.min(40, n.length)))
  })

  const lead = opts.generated.content.split(/\n\s*\n/).find((p) => p.trim() && !p.startsWith('#')) || ''
  const lexicalInflations = flagLexicalInflations(opts.source, combined)
  const certaintyShifts = detectCertaintyShifts(
    opts.source,
    `${opts.generated.title}\n${opts.generated.spot}\n${lead}`
  )
  const missingAttr = claimAttributionMissing(opts.source, opts.generated.title, opts.generated.spot, lead)

  const reviewFlags: string[] = []
  if (unsupportedNumbers.length) reviewFlags.push('UNSUPPORTED_NUMBER')
  if (unsupportedNamedEntities.length) reviewFlags.push('UNSUPPORTED_NAMED_ENTITY')
  if (unsupportedQuotes.length) reviewFlags.push('UNSUPPORTED_QUOTE')
  if (lexicalInflations.length) reviewFlags.push('LEXICAL_INFLATION')
  if (certaintyShifts.length) reviewFlags.push('CERTAINTY_SHIFT')
  if (missingAttr) reviewFlags.push('CLAIM_ATTRIBUTION_MISSING')

  return {
    unsupportedNumbers,
    unsupportedNamedEntities,
    unsupportedQuotes,
    lexicalInflations,
    certaintyShifts,
    claimAttributionMissing: missingAttr,
    reviewFlags,
  }
}
