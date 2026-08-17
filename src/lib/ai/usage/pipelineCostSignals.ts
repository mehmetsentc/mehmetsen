type LooseEvent = Record<string, unknown>

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function articleKey(event: LooseEvent): string | null {
  return asString(event.newsId) || asString(event.queueId) || asString(event.traceId) || null
}

export function countDuplicateStage1Calls(events: LooseEvent[]): {
  groups: number
  extraCalls: number
} {
  const byHash = new Map<string, number>()
  for (const event of events) {
    if (asString(event.agentName) !== 'stage1_writer') continue
    if (asString(event.operation) !== 'generate_article') continue
    const hash = asString(event.inputHash)
    if (!hash) continue
    byHash.set(hash, (byHash.get(hash) ?? 0) + 1)
  }
  let groups = 0
  let extraCalls = 0
  for (const calls of byHash.values()) {
    if (calls >= 2) {
      groups += 1
      extraCalls += calls - 1
    }
  }
  return { groups, extraCalls }
}

export function measureStage3ClassifierOverlap(events: LooseEvent[]): {
  both: number
  stage3Only: number
  classifierOnly: number
  compared: number
  exactAgreement: number
  agreementRate: number | null
} {
  const groups = new Map<string, { stage3?: string; classifier?: string }>()
  let stage3Loose = 0
  let classifierLoose = 0

  for (const event of events) {
    const agent = asString(event.agentName)
    const key = articleKey(event)
    if (agent === 'stage3_category') {
      if (!key) {
        stage3Loose += 1
        continue
      }
      const row = groups.get(key) ?? {}
      row.stage3 = asString(event.resultCategoryId) ?? row.stage3 ?? ''
      groups.set(key, row)
    } else if (agent === 'category_classifier') {
      if (!key) {
        classifierLoose += 1
        continue
      }
      const row = groups.get(key) ?? {}
      row.classifier = asString(event.resultCategoryId) ?? row.classifier ?? ''
      groups.set(key, row)
    }
  }

  let both = 0
  let stage3Only = 0
  let classifierOnly = 0
  let compared = 0
  let exactAgreement = 0
  for (const row of groups.values()) {
    const has3 = row.stage3 !== undefined
    const hasC = row.classifier !== undefined
    if (has3 && hasC) {
      both += 1
      if (row.stage3 && row.classifier) {
        compared += 1
        if (row.stage3 === row.classifier) exactAgreement += 1
      }
    } else if (has3) stage3Only += 1
    else if (hasC) classifierOnly += 1
  }

  return {
    both,
    stage3Only: stage3Only + stage3Loose,
    classifierOnly: classifierOnly + classifierLoose,
    compared,
    exactAgreement,
    agreementRate: compared > 0 ? exactAgreement / compared : null,
  }
}

export function providerFailureRate(
  events: LooseEvent[],
  provider: string
): { requests: number; errors: number; rate: number | null; byCode: Record<string, number> } {
  let requests = 0
  let errors = 0
  const byCode: Record<string, number> = {}
  for (const event of events) {
    if (asString(event.provider) !== provider) continue
    requests += 1
    if (event.success === false) {
      errors += 1
      const code = asString(event.errorCode) || 'other'
      byCode[code] = (byCode[code] || 0) + 1
    }
  }
  return {
    requests,
    errors,
    rate: requests > 0 ? errors / requests : null,
    byCode,
  }
}

const GENERIC_CATEGORY_IDS = new Set([
  'gundem',
  'yerel-haber',
  'spor',
  'dunya',
  'kibris-haberleri',
  'yasam',
])

export type Stage3VariantStats = {
  requests: number
  avgInputTokens: number | null
  avgOutputTokens: number | null
  avgLatencyMs: number | null
  errorRate: number | null
}

export type Stage3AgreementStats = {
  comparablePairs: number
  agree: number
  disagree: number
  agreementRate: number | null
  genericRate: number | null
}

export type Stage3CompactCanary = {
  control: Stage3VariantStats
  compact: Stage3VariantStats
  controlFallback: Stage3VariantStats
  tokenSaving: {
    controlAvgInput: number | null
    compactAvgInput: number | null
    difference: number | null
    reductionPct: number | null
  }
  compactQuality: Stage3AgreementStats
  controlQuality: Stage3AgreementStats
}

function emptyVariant(): Stage3VariantStats {
  return {
    requests: 0,
    avgInputTokens: null,
    avgOutputTokens: null,
    avgLatencyMs: null,
    errorRate: null,
  }
}

function variantStats(events: LooseEvent[]): Stage3VariantStats {
  if (events.length === 0) return emptyVariant()
  let input = 0
  let inputN = 0
  let output = 0
  let outputN = 0
  let latency = 0
  let latencyN = 0
  let errors = 0
  for (const event of events) {
    const inTok = typeof event.inputTokens === 'number' && Number.isFinite(event.inputTokens) ? event.inputTokens : null
    const outTok = typeof event.outputTokens === 'number' && Number.isFinite(event.outputTokens) ? event.outputTokens : null
    const lat = typeof event.latencyMs === 'number' && Number.isFinite(event.latencyMs) ? event.latencyMs : null
    if (inTok != null) {
      input += inTok
      inputN += 1
    }
    if (outTok != null) {
      output += outTok
      outputN += 1
    }
    if (lat != null) {
      latency += lat
      latencyN += 1
    }
    if (event.success === false) errors += 1
  }
  return {
    requests: events.length,
    avgInputTokens: inputN > 0 ? input / inputN : null,
    avgOutputTokens: outputN > 0 ? output / outputN : null,
    avgLatencyMs: latencyN > 0 ? latency / latencyN : null,
    errorRate: events.length > 0 ? errors / events.length : null,
  }
}

function agreementFor(
  events: LooseEvent[],
  stage3Variant: 'control' | 'compact'
): Stage3AgreementStats {
  const stage3ByKey = new Map<string, string>()
  const classifierByKey = new Map<string, string>()
  let generic = 0
  let genericDenom = 0

  for (const event of events) {
    const agent = asString(event.agentName)
    if (agent === 'category_classifier') {
      const key = articleKey(event)
      const id = asString(event.resultCategoryId)
      if (key && id && event.success !== false) classifierByKey.set(key, id)
      continue
    }
    if (agent !== 'stage3_category') continue
    if (asString(event.promptVariant) !== stage3Variant) continue
    if (event.success === false) continue
    const id = asString(event.resultCategoryId)
    if (!id) continue
    genericDenom += 1
    if (GENERIC_CATEGORY_IDS.has(id)) generic += 1
    const key = articleKey(event)
    if (key) stage3ByKey.set(key, id)
  }

  let comparablePairs = 0
  let agree = 0
  for (const [key, stage3Id] of stage3ByKey) {
    const clf = classifierByKey.get(key)
    if (!clf) continue
    comparablePairs += 1
    if (clf === stage3Id) agree += 1
  }
  const disagree = comparablePairs - agree
  return {
    comparablePairs,
    agree,
    disagree,
    agreementRate: comparablePairs > 0 ? agree / comparablePairs : null,
    genericRate: genericDenom > 0 ? generic / genericDenom : null,
  }
}

export function measureStage3CompactCanary(events: LooseEvent[]): Stage3CompactCanary {
  const stage3 = events.filter((event) => asString(event.agentName) === 'stage3_category')
  const control = variantStats(stage3.filter((e) => asString(e.promptVariant) === 'control'))
  const compact = variantStats(stage3.filter((e) => asString(e.promptVariant) === 'compact'))
  const controlFallback = variantStats(stage3.filter((e) => asString(e.promptVariant) === 'control_fallback'))
  const controlAvg = control.avgInputTokens
  const compactAvg = compact.avgInputTokens
  const difference =
    controlAvg != null && compactAvg != null ? controlAvg - compactAvg : null
  const reductionPct =
    difference != null && controlAvg != null && controlAvg > 0 ? difference / controlAvg : null
  return {
    control,
    compact,
    controlFallback,
    tokenSaving: {
      controlAvgInput: controlAvg,
      compactAvgInput: compactAvg,
      difference,
      reductionPct,
    },
    compactQuality: agreementFor(events, 'compact'),
    controlQuality: agreementFor(events, 'control'),
  }
}
