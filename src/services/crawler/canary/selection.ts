import type { CanaryClusterInput, CanaryMemberInput, CanarySelectionReport } from './types'
import { canaryConfig } from './flags'

const AVOID_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\b(öldü|ölüm|vefat|cenaze|şehit|katliam)\b/i, reason: 'death' },
  { re: /\b(deprem|sel|yangın|felaket|afet|fırtına\s+felaketi)\b/i, reason: 'disaster' },
  { re: /\b(terör|bomb[ae]|saldırı|rehin)\b/i, reason: 'terrorism' },
  { re: /\b(cinayet|tecavüz|istismar|uyuşturucu|silahlı\s+saldırı|gözaltı\s+iddiası)\b/i, reason: 'crime_allegation' },
  { re: /\b(kanser|salgın|pandemi|aşı\s+zorunlu|klinik\s+deneme)\b/i, reason: 'medical' },
  { re: /\b(seçim|oy\s+pusulası|sandık|aday\s+açıkladı|parti\s+kongresi)\b/i, reason: 'election' },
  { re: /\b(son\s+dakika|flaş\s+haber|acil\s+durum)\b/i, reason: 'high_risk_breaking' },
]

const PREFER_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\b(belediye|kaymakam|vali|muhtar|imar|altyapı)\b/i, reason: 'local_admin' },
  { re: /\b(kültür|müze|sergi|konser|festival|tiyatro)\b/i, reason: 'culture' },
  { re: /\b(turizm|otel|ziyaretçi|gezi|troya)\b/i, reason: 'tourism' },
  { re: /\b(okul|üniversite|öğrenci|eğitim|seminer)\b/i, reason: 'education' },
  { re: /\b(ekonomi|yatırım|istihdam|esnaf|ticaret|sanayi)\b/i, reason: 'economy' },
  { re: /\b(teknoloji|yazılım|dijital|inovasyon|startup)\b/i, reason: 'tech' },
  { re: /\b(spor|maç|turnuva|şampiyona|antrenman)\b/i, reason: 'sports' },
  { re: /\b(park|yol\s+çalışması|kanalizasyon|su\s+şebekesi|kentsel\s+dönüşüm)\b/i, reason: 'local_development' },
]

function eventText(cluster: CanaryClusterInput, members: CanaryMemberInput[]): string {
  const parts = [
    cluster.canonicalTitle || '',
    cluster.normalizedTopic || '',
    ...members.map((m) => `${m.title || ''} ${(m.body || '').slice(0, 800)}`),
  ]
  return parts.join('\n')
}

function ageHours(cluster: CanaryClusterInput, now: Date): number {
  const t = cluster.lastSeenAt || cluster.firstSeenAt
  if (!t) return 0
  return Math.max(0, (now.getTime() - t.getTime()) / 3_600_000)
}

/**
 * Selection helpers for FUTURE canary (Stage 2+). Stage 1 does not spend.
 * APPROVED_FOR_AI alone never authorizes paid execution.
 */
export function evaluateCanarySelection(
  cluster: CanaryClusterInput,
  members: CanaryMemberInput[],
  now = new Date()
): CanarySelectionReport {
  const cfg = canaryConfig()
  const preferReasons: string[] = []
  const avoidReasons: string[] = []
  const notesTr: string[] = []
  const text = eventText(cluster, members)

  for (const p of PREFER_PATTERNS) {
    if (p.re.test(text)) preferReasons.push(p.reason)
  }
  for (const p of AVOID_PATTERNS) {
    if (p.re.test(text)) avoidReasons.push(p.reason)
  }

  const valid = members.filter(
    (m) =>
      !m.isExactDuplicate &&
      m.sourceStatus !== 'DISABLED' &&
      m.sourceStatus !== 'PAUSED' &&
      m.editorialStatus !== 'SKIPPED' &&
      ((m.body || '').replace(/<[^>]+>/g, ' ').trim().length >= 80)
  )
  const independentSources = new Set(valid.map((m) => m.sourceId)).size
  const hasPrimary = valid.length > 0
  const hasMedia = valid.some((m) => m.hasMedia)
  const published = Boolean(cluster.publishedNewsId) || valid.some((m) => m.editorialStatus === 'PUBLISHED' && m.editorialNewsId)
  const age = ageHours(cluster, now)
  const stale = age > cfg.staleHours

  if (!hasPrimary) {
    avoidReasons.push('no_clean_body')
    notesTr.push('Geçerli birincil gövde yok.')
  }
  if (independentSources < 2) {
    notesTr.push('İdeal: 2+ bağımsız kaynak (zorunlu değil, tercih).')
  } else {
    preferReasons.push('multi_source')
  }
  if (hasMedia) preferReasons.push('has_media')
  if (published) {
    avoidReasons.push('already_published')
    notesTr.push('Yayımlanmış olay — canary adayı değil.')
  }
  if (stale) {
    avoidReasons.push('stale')
    notesTr.push(`Olay ${age.toFixed(0)}s yaşında (eşik ${cfg.staleHours}s).`)
  }
  if (cluster.editorialDecision === 'APPROVED_FOR_AI') {
    notesTr.push('APPROVED_FOR_AI yalnızca kuyruk onayıdır; ücretli canary için APPROVED_FOR_REAL_CANARY_EXECUTION gerekir.')
  }

  const sensitive = avoidReasons.some((r) =>
    ['death', 'disaster', 'terrorism', 'crime_allegation', 'medical', 'election', 'high_risk_breaking'].includes(r)
  )
  if (sensitive) notesTr.push('Hassas konu — canary için kaçının.')

  let score = 40 + preferReasons.length * 8 - avoidReasons.length * 15
  if (independentSources >= 2) score += 12
  if (hasMedia) score += 5
  if (age <= 24) score += 10
  else if (age <= 48) score += 5
  score = Math.max(0, Math.min(100, score))

  const isCandidate =
    hasPrimary &&
    !published &&
    !stale &&
    !sensitive &&
    avoidReasons.every((r) => !['no_clean_body', 'already_published', 'stale'].includes(r))

  return {
    isCandidate,
    preferReasons: [...new Set(preferReasons)],
    avoidReasons: [...new Set(avoidReasons)],
    score,
    notesTr,
  }
}
