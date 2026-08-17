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
