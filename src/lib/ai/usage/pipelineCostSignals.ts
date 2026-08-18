import {
  CONTINUATION_TRIGGERS,
  QUALITY_RETRY_TRIGGERS,
  sanitizeRetryTriggers,
  type RetryTrigger,
} from '@/lib/ai/usage/retryTriggers'

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

export type Stage1ReasonRates = {
  initial: number
  continuation: number
  quality_retry: number
  provider_retry: number
  pipeline_retry: number
  unknown: number
  total: number
}

export type Stage1CostAnalysis = {
  newsCount: number
  stage1Requests: number
  callsPerNews: number | null
  tokensPerNews: number | null
  inputTokensPerNews: number | null
  outputTokensPerNews: number | null
  avgInputTokens: number | null
  avgOutputTokens: number | null
  maxCallsPerNews: number
  reasonCounts: Stage1ReasonRates
  reasonRates: Omit<Stage1ReasonRates, 'total'>
  newsWithContinuation: number
  newsWithQualityRetry: number
  extraContinuationTokens: number
  extraQualityRetryStage1Tokens: number
  extraProviderRetryTokens: number
  retryTokenShare: number
  retryTriggers: Record<RetryTrigger, number>
  qualityRetryDownstream: {
    extraStage3Calls: number
    extraFactCheckerCalls: number
    extraChiefEditorCalls: number
  }
  duplicate: { groups: number; extraCalls: number; extraTokens: number }
  promptParts: {
    avgSystemTokens: number | null
    avgSourceTokens: number | null
    avgInstructionTokens: number | null
    avgOtherTokens: number | null
    sourceShare: number | null
    instructionShare: number | null
  }
  shadow: {
    requests: number
    successRate: number | null
    avgInputTokens: number | null
    avgOutputTokens: number | null
    avgLatencyMs: number | null
    providers: Record<string, number>
  }
  productionVsShadow: {
    productionAvgInput: number | null
    shadowAvgInput: number | null
    productionAvgOutput: number | null
    shadowAvgOutput: number | null
    productionAvgLatencyMs: number | null
    shadowAvgLatencyMs: number | null
    inputReductionPct: number | null
  }
  projectedSavings: {
    p10: { tokens: number; usd: number | null }
    p25: { tokens: number; usd: number | null }
    p50: { tokens: number; usd: number | null }
    p100: { tokens: number; usd: number | null }
  }
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function emptyReasonCounts(): Stage1ReasonRates {
  return {
    initial: 0,
    continuation: 0,
    quality_retry: 0,
    provider_retry: 0,
    pipeline_retry: 0,
    unknown: 0,
    total: 0,
  }
}

function emptyRetryTriggerCounts(): Record<RetryTrigger, number> {
  const out = {} as Record<RetryTrigger, number>
  for (const trigger of CONTINUATION_TRIGGERS) out[trigger] = 0
  for (const trigger of QUALITY_RETRY_TRIGGERS) out[trigger] = 0
  return out
}

function bumpAgentCount(map: Map<string, number>, event: LooseEvent, agent: string) {
  if (asString(event.agentName) !== agent) return
  const key = articleKey(event)
  if (!key) return
  map.set(key, (map.get(key) ?? 0) + 1)
}

function extraCallsForNews(map: Map<string, number>, newsIds: Set<string>): number {
  let extra = 0
  for (const id of newsIds) {
    extra += Math.max(0, (map.get(id) ?? 0) - 1)
  }
  return extra
}

export function measureStage1CostAnalysis(events: LooseEvent[]): Stage1CostAnalysis {
  const stage1 = events.filter((e) => {
    if (asString(e.agentName) !== 'stage1_writer') return false
    const op = asString(e.operation)
    return !op || op === 'generate_article'
  })
  const shadow = events.filter((e) => asString(e.agentName) === 'stage1_writer_shadow')
  const duplicate = countDuplicateStage1Calls(events)

  const newsKeys = new Set<string>()
  const newsContinuation = new Set<string>()
  const newsQuality = new Set<string>()
  const callsByNews = new Map<string, number>()
  const reasonCounts = emptyReasonCounts()
  const retryTriggers = emptyRetryTriggerCounts()
  const inputTok: number[] = []
  const outputTok: number[] = []
  const latency: number[] = []
  const sysTok: number[] = []
  const srcTok: number[] = []
  const insTok: number[] = []
  const othTok: number[] = []
  let stage1Tokens = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let extraContinuationTokens = 0
  let extraQualityRetryStage1Tokens = 0
  let extraProviderRetryTokens = 0
  let extraDupTokens = 0
  const hashTokens = new Map<string, number[]>()

  for (const event of stage1) {
    const key = articleKey(event)
    if (key) {
      newsKeys.add(key)
      callsByNews.set(key, (callsByNews.get(key) ?? 0) + 1)
    }
    const reason = asString(event.generationReason) || 'unknown'
    if (reason === 'initial') reasonCounts.initial += 1
    else if (reason === 'continuation') {
      reasonCounts.continuation += 1
      if (key) newsContinuation.add(key)
    } else if (reason === 'quality_retry') {
      reasonCounts.quality_retry += 1
      if (key) newsQuality.add(key)
    } else if (reason === 'provider_retry') reasonCounts.provider_retry += 1
    else if (reason === 'pipeline_retry') reasonCounts.pipeline_retry += 1
    else reasonCounts.unknown += 1
    reasonCounts.total += 1

    const inTok = typeof event.inputTokens === 'number' && Number.isFinite(event.inputTokens) ? event.inputTokens : null
    const outTok =
      typeof event.outputTokens === 'number' && Number.isFinite(event.outputTokens) ? event.outputTokens : null
    const lat = typeof event.latencyMs === 'number' && Number.isFinite(event.latencyMs) ? event.latencyMs : null
    if (inTok != null) inputTok.push(inTok)
    if (outTok != null) outputTok.push(outTok)
    if (lat != null) latency.push(lat)
    const eventTokens = (inTok ?? 0) + (outTok ?? 0)
    stage1Tokens += eventTokens
    totalInputTokens += inTok ?? 0
    totalOutputTokens += outTok ?? 0
    if (reason === 'continuation') extraContinuationTokens += eventTokens
    else if (reason === 'quality_retry') extraQualityRetryStage1Tokens += eventTokens
    else if (reason === 'provider_retry') extraProviderRetryTokens += eventTokens

    for (const trigger of sanitizeRetryTriggers(event.retryTriggers)) {
      retryTriggers[trigger] += 1
    }

    const ps = typeof event.promptSystemTokens === 'number' ? event.promptSystemTokens : null
    const po = typeof event.promptSourceTokens === 'number' ? event.promptSourceTokens : null
    const pi = typeof event.promptInstructionTokens === 'number' ? event.promptInstructionTokens : null
    const px = typeof event.promptOtherTokens === 'number' ? event.promptOtherTokens : null
    if (ps != null) sysTok.push(ps)
    if (po != null) srcTok.push(po)
    if (pi != null) insTok.push(pi)
    if (px != null) othTok.push(px)

    const hash = asString(event.inputHash)
    if (hash) {
      const list = hashTokens.get(hash) ?? []
      list.push(eventTokens)
      hashTokens.set(hash, list)
    }
  }

  for (const list of hashTokens.values()) {
    if (list.length >= 2) extraDupTokens += list.slice(1).reduce((a, b) => a + b, 0)
  }

  const shadowInput: number[] = []
  const shadowOutput: number[] = []
  const shadowLatency: number[] = []
  let shadowOk = 0
  const providers: Record<string, number> = {}
  for (const event of shadow) {
    const provider = asString(event.shadowProvider) || asString(event.provider) || 'unknown'
    providers[provider] = (providers[provider] ?? 0) + 1
    if (event.shadowSuccess === true || event.success === true) shadowOk += 1
    const inTok =
      typeof event.shadowInputTokens === 'number'
        ? event.shadowInputTokens
        : typeof event.inputTokens === 'number'
          ? event.inputTokens
          : null
    const outTok =
      typeof event.shadowOutputTokens === 'number'
        ? event.shadowOutputTokens
        : typeof event.outputTokens === 'number'
          ? event.outputTokens
          : null
    const lat =
      typeof event.shadowLatencyMs === 'number'
        ? event.shadowLatencyMs
        : typeof event.latencyMs === 'number'
          ? event.latencyMs
          : null
    if (typeof inTok === 'number' && Number.isFinite(inTok)) shadowInput.push(inTok)
    if (typeof outTok === 'number' && Number.isFinite(outTok)) shadowOutput.push(outTok)
    if (typeof lat === 'number' && Number.isFinite(lat)) shadowLatency.push(lat)
  }

  const newsCount = newsKeys.size
  const callsPerNews = newsCount > 0 ? stage1.length / newsCount : null
  const tokensPerNews = newsCount > 0 ? stage1Tokens / newsCount : null
  const inputTokensPerNews = newsCount > 0 ? totalInputTokens / newsCount : null
  const outputTokensPerNews = newsCount > 0 ? totalOutputTokens / newsCount : null
  let maxCallsPerNews = 0
  for (const n of callsByNews.values()) if (n > maxCallsPerNews) maxCallsPerNews = n
  const avgInput = avg(inputTok)
  const avgOutput = avg(outputTok)
  const shadowAvgInput = avg(shadowInput)
  const shadowAvgOutput = avg(shadowOutput)
  const inputReductionPct =
    avgInput != null && shadowAvgInput != null && avgInput > 0 ? (avgInput - shadowAvgInput) / avgInput : null

  const stage3ByNews = new Map<string, number>()
  const factByNews = new Map<string, number>()
  const chiefByNews = new Map<string, number>()
  for (const event of events) {
    bumpAgentCount(stage3ByNews, event, 'stage3_category')
    bumpAgentCount(factByNews, event, 'fact_checker')
    bumpAgentCount(chiefByNews, event, 'chief_editor')
  }

  const rate = (n: number) => (reasonCounts.total > 0 ? n / reasonCounts.total : 0)
  const avgSys = avg(sysTok)
  const avgSrc = avg(srcTok)
  const avgIns = avg(insTok)
  const avgOth = avg(othTok)
  const partSum = (avgSys ?? 0) + (avgSrc ?? 0) + (avgIns ?? 0) + (avgOth ?? 0)

  const extraRetryTokens =
    extraContinuationTokens + extraQualityRetryStage1Tokens + extraProviderRetryTokens
  const retryTokenShare = stage1Tokens > 0 ? extraRetryTokens / stage1Tokens : 0
  const retryShare =
    reasonCounts.total > 0
      ? (reasonCounts.continuation + reasonCounts.quality_retry + reasonCounts.provider_retry) /
        reasonCounts.total
      : 0
  const extraRetryTokensForProjection = Math.max(extraRetryTokens, stage1Tokens * retryShare)

  const project = (pct: number) => {
    const shadowDelta =
      avgInput != null && shadowAvgInput != null ? Math.max(0, avgInput - shadowAvgInput) : 0
    const tokens = Math.round(extraRetryTokensForProjection * pct + shadowDelta * stage1.length * pct)
    return { tokens, usd: null as number | null }
  }

  return {
    newsCount,
    stage1Requests: stage1.length,
    callsPerNews,
    tokensPerNews,
    inputTokensPerNews,
    outputTokensPerNews,
    avgInputTokens: avgInput,
    avgOutputTokens: avgOutput,
    maxCallsPerNews,
    reasonCounts,
    reasonRates: {
      initial: rate(reasonCounts.initial),
      continuation: rate(reasonCounts.continuation),
      quality_retry: rate(reasonCounts.quality_retry),
      provider_retry: rate(reasonCounts.provider_retry),
      pipeline_retry: rate(reasonCounts.pipeline_retry),
      unknown: rate(reasonCounts.unknown),
    },
    newsWithContinuation: newsContinuation.size,
    newsWithQualityRetry: newsQuality.size,
    extraContinuationTokens,
    extraQualityRetryStage1Tokens,
    extraProviderRetryTokens,
    retryTokenShare,
    retryTriggers,
    qualityRetryDownstream: {
      extraStage3Calls: extraCallsForNews(stage3ByNews, newsQuality),
      extraFactCheckerCalls: extraCallsForNews(factByNews, newsQuality),
      extraChiefEditorCalls: extraCallsForNews(chiefByNews, newsQuality),
    },
    duplicate: { ...duplicate, extraTokens: extraDupTokens },
    promptParts: {
      avgSystemTokens: avgSys,
      avgSourceTokens: avgSrc,
      avgInstructionTokens: avgIns,
      avgOtherTokens: avgOth,
      sourceShare: partSum > 0 && avgSrc != null ? avgSrc / partSum : null,
      instructionShare: partSum > 0 && avgIns != null ? avgIns / partSum : null,
    },
    shadow: {
      requests: shadow.length,
      successRate: shadow.length > 0 ? shadowOk / shadow.length : null,
      avgInputTokens: shadowAvgInput,
      avgOutputTokens: shadowAvgOutput,
      avgLatencyMs: avg(shadowLatency),
      providers,
    },
    productionVsShadow: {
      productionAvgInput: avgInput,
      shadowAvgInput,
      productionAvgOutput: avgOutput,
      shadowAvgOutput,
      productionAvgLatencyMs: avg(latency),
      shadowAvgLatencyMs: avg(shadowLatency),
      inputReductionPct,
    },
    projectedSavings: {
      p10: project(0.1),
      p25: project(0.25),
      p50: project(0.5),
      p100: project(1),
    },
  }
}
