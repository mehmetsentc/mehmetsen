/**
 * Phase 4F.3.1 — unique economic decision identity for SHADOW_AUTO_DRAFT.
 * Evaluations may repeat every tick; economics count once per
 * (cluster_id, content_fingerprint, prespend_gate_version).
 */

export const PRESPEND_GATE_VERSION_4F31 = '4F3.1' as const

export const SHADOW_REVISION_KINDS = ['NEW_EVENT', 'MATERIAL_UPDATE', 'DUPLICATE_EVAL'] as const
export type ShadowRevisionKind = (typeof SHADOW_REVISION_KINDS)[number]

export function economicDecisionKey(input: {
  clusterId: string
  contentFingerprint: string
  prespendGateVersion: string
}): string {
  return `${input.clusterId}|${input.contentFingerprint}|${input.prespendGateVersion}`
}

/**
 * Classify whether this evaluation opens a new economic decision.
 * priorFingerprintsForCluster: fingerprints already seen for this cluster under any gate
 *   (excluding the current fingerprint when it already exists under this gate).
 */
export function classifyShadowRevisionKind(input: {
  clusterHadAnyPriorDecision: boolean
  sameFingerprintAndGateExists: boolean
}): ShadowRevisionKind {
  if (input.sameFingerprintAndGateExists) return 'DUPLICATE_EVAL'
  if (!input.clusterHadAnyPriorDecision) return 'NEW_EVENT'
  return 'MATERIAL_UPDATE'
}

export type UniqueEconomicRow = {
  clusterId: string
  contentFingerprint: string | null
  prespendGateVersion: string | null
  action: string
  blockReason: string | null
  economicTier: string | null
  estimatedCostUsd: number | null
  costKnown: boolean
  prespendOutcome: string
}

export type UniqueEconomicMetrics = {
  rawEvaluations: number
  distinctClusters: number
  uniqueEventRevisions: number
  uniqueWouldDispatch: number
  uniqueWouldBlock: number
  byTier: Record<string, number>
  byBlockReason: Record<string, number>
  byPrespend: Record<string, number>
  /** Unique decisions that WOULD_DISPATCH (after gate). */
  estimatedRequestsAfterGate: number
  /** Unique decisions that are economically "would spend" candidates before gate = all unique rows. */
  estimatedRequestsBeforeGate: number
  estimatedRequestsPrevented: number
  requestPreventionPct: number | null
  estimatedSpendAfterGateUsd: number | null
  estimatedSpendBeforeGateUsd: number | null
  estimatedSpendPreventedUsd: number | null
  spendPreventionPct: number | null
  costUnknownCount: number
  noteTr: string
}

function roundUsd(n: number): number {
  return Math.round(n * 1e8) / 1e8
}

/**
 * Aggregate UNIQUE economic metrics.
 * Prefer pre-deduped unique rows (from economic_decisions table).
 * For legacy 4F.3 rows without fingerprint: fall back to first row per cluster_id
 * and label note accordingly.
 */
export function aggregateUniqueEconomicMetrics(
  rows: UniqueEconomicRow[],
  opts?: { legacyClusterOnly?: boolean }
): UniqueEconomicMetrics {
  const byKey = new Map<string, UniqueEconomicRow>()
  for (const r of rows) {
    const fp = r.contentFingerprint?.trim() || ''
    const gate = r.prespendGateVersion?.trim() || 'LEGACY_4F3'
    const key =
      fp.length > 0
        ? economicDecisionKey({
            clusterId: r.clusterId,
            contentFingerprint: fp,
            prespendGateVersion: gate,
          })
        : `cluster:${r.clusterId}`
    if (!byKey.has(key)) byKey.set(key, r)
  }

  const unique = [...byKey.values()]
  const clusters = new Set(unique.map((r) => r.clusterId))
  const byTier: Record<string, number> = {}
  const byBlockReason: Record<string, number> = {}
  const byPrespend: Record<string, number> = {}
  let uniqueWouldDispatch = 0
  let uniqueWouldBlock = 0
  let spendAfter = 0
  let spendBefore = 0
  let spendAfterKnown = true
  let spendBeforeKnown = true
  let costUnknownCount = 0

  for (const d of unique) {
    byPrespend[d.prespendOutcome] = (byPrespend[d.prespendOutcome] || 0) + 1
    const tier = d.economicTier || 'UNKNOWN'
    byTier[tier] = (byTier[tier] || 0) + 1
    if (!d.costKnown || d.estimatedCostUsd == null) costUnknownCount += 1

    // Before gate: every unique revision is a potential provider request.
    if (d.estimatedCostUsd != null && d.costKnown) spendBefore += d.estimatedCostUsd
    else spendBeforeKnown = false

    if (d.action === 'WOULD_DISPATCH') {
      uniqueWouldDispatch += 1
      if (d.estimatedCostUsd != null && d.costKnown) spendAfter += d.estimatedCostUsd
      else spendAfterKnown = false
    } else {
      uniqueWouldBlock += 1
      const reason = d.blockReason || d.prespendOutcome || 'WOULD_BLOCK'
      byBlockReason[reason] = (byBlockReason[reason] || 0) + 1
    }
  }

  const estimatedRequestsBeforeGate = unique.length
  const estimatedRequestsAfterGate = uniqueWouldDispatch
  const estimatedRequestsPrevented = Math.max(0, estimatedRequestsBeforeGate - estimatedRequestsAfterGate)
  const requestPreventionPct =
    estimatedRequestsBeforeGate > 0
      ? Math.round((estimatedRequestsPrevented / estimatedRequestsBeforeGate) * 1000) / 10
      : null

  const estimatedSpendBeforeGateUsd = spendBeforeKnown ? roundUsd(spendBefore) : null
  const estimatedSpendAfterGateUsd = spendAfterKnown ? roundUsd(spendAfter) : null
  const estimatedSpendPreventedUsd =
    estimatedSpendBeforeGateUsd != null && estimatedSpendAfterGateUsd != null
      ? roundUsd(estimatedSpendBeforeGateUsd - estimatedSpendAfterGateUsd)
      : null
  const spendPreventionPct =
    estimatedSpendBeforeGateUsd != null &&
    estimatedSpendBeforeGateUsd > 0 &&
    estimatedSpendPreventedUsd != null
      ? Math.round((estimatedSpendPreventedUsd / estimatedSpendBeforeGateUsd) * 1000) / 10
      : null

  return {
    rawEvaluations: rows.length,
    distinctClusters: clusters.size,
    uniqueEventRevisions: unique.length,
    uniqueWouldDispatch,
    uniqueWouldBlock,
    byTier,
    byBlockReason,
    byPrespend,
    estimatedRequestsAfterGate,
    estimatedRequestsBeforeGate,
    estimatedRequestsPrevented,
    requestPreventionPct,
    estimatedSpendAfterGateUsd,
    estimatedSpendBeforeGateUsd,
    estimatedSpendPreventedUsd,
    spendPreventionPct,
    costUnknownCount,
    noteTr: opts?.legacyClusterOnly
      ? '4F.3 geçmiş satırlarda fingerprint yok; benzersiz karar ≈ ilk değerlendirme / cluster.'
      : 'Benzersiz ekonomi: cluster_id + content_fingerprint + prespend_gate_version.',
  }
}

/** Recalculate raw (inflated) vs unique from mixed evaluation rows. */
export function compareRawVsUniqueEconomics(evaluationRows: UniqueEconomicRow[]): {
  oldRepeatedEstimate: UniqueEconomicMetrics
  newUniqueEstimate: UniqueEconomicMetrics
} {
  const rawFunnel = aggregateUniqueEconomicMetrics(
    evaluationRows.map((r, i) => ({
      ...r,
      // Force each row unique by synthetic fp so "raw" counts every evaluation
      contentFingerprint: `raw-${i}-${r.clusterId}`,
      prespendGateVersion: r.prespendGateVersion || 'LEGACY_4F3',
    }))
  )
  const legacyMissingFp = evaluationRows.every((r) => !r.contentFingerprint)
  const unique = aggregateUniqueEconomicMetrics(evaluationRows, {
    legacyClusterOnly: legacyMissingFp,
  })
  return {
    oldRepeatedEstimate: {
      ...rawFunnel,
      noteTr: 'Eski tekrarlı değerlendirme tahmini (her tick ayrı sayılır).',
    },
    newUniqueEstimate: unique,
  }
}
