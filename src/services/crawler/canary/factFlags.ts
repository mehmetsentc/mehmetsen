import type { CanaryDraftFields, CanaryEvidencePack, CanaryFactFlag } from './types'

const DATE_RE = /\b(\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{1,2}\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+\d{4})\b/gi
const NUMBER_RE = /\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?\b/g
const LOCATION_HINTS = [
  'Çanakkale',
  'İstanbul',
  'Ankara',
  'İzmir',
  'Bursa',
  'Antalya',
  'Troya',
  'Gelibolu',
  'Biga',
  'Ezine',
]

/**
 * Deterministic fact flags — NO second AI FactChecker.
 * Compares draft tokens against evidence pack text.
 */
export function buildDeterministicFactFlags(
  draft: CanaryDraftFields,
  pack: CanaryEvidencePack
): CanaryFactFlag[] {
  const evidence = pack.packedText.toLowerCase()
  const draftText = [draft.title, draft.spot, draft.summary, draft.body].join('\n')
  const flags: CanaryFactFlag[] = []

  const nums = draftText.match(NUMBER_RE) || []
  for (const n of [...new Set(nums)].slice(0, 20)) {
    if (n.length < 2) continue
    const inEvidence = evidence.includes(n.toLowerCase())
    if (!inEvidence) {
      flags.push({
        kind: 'number',
        value: n,
        inEvidence: false,
        messageTr: `Sayı "${n}" taslakta var, kanıtta bulunamadı — doğrulayın.`,
      })
    }
  }

  const dates = draftText.match(DATE_RE) || []
  for (const d of [...new Set(dates)].slice(0, 10)) {
    const inEvidence = evidence.includes(d.toLowerCase())
    if (!inEvidence) {
      flags.push({
        kind: 'date',
        value: d,
        inEvidence: false,
        messageTr: `Tarih "${d}" kanıtta net değil — doğrulayın.`,
      })
    }
  }

  for (const loc of LOCATION_HINTS) {
    if (new RegExp(loc, 'i').test(draftText) && !new RegExp(loc, 'i').test(pack.packedText)) {
      flags.push({
        kind: 'location',
        value: loc,
        inEvidence: false,
        messageTr: `Konum "${loc}" taslakta var, kanıtta yok — doğrulayın.`,
      })
    }
  }

  // Simple capitalized multi-word entities (heuristic)
  const entities = draftText.match(/\b[A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)+\b/g) || []
  for (const e of [...new Set(entities)].slice(0, 12)) {
    if (!pack.packedText.includes(e)) {
      flags.push({
        kind: 'entity',
        value: e,
        inEvidence: false,
        messageTr: `İsim/kurum "${e}" kanıtta bulunamadı — doğrulayın.`,
      })
    }
  }

  return flags
}
