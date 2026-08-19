import type { EvaluationInputCluster, EventAiPack, MemberEvidence, PackedSource } from './types'
import { selectEvidenceSources, toPackedSource } from './sourceSelect'

function stripMetaDump(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b(home|menu|subscribe|cookie|copyright|all rights reserved)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildEventAiPack(
  cluster: EvaluationInputCluster,
  members: MemberEvidence[],
  now = new Date()
): EventAiPack {
  const selected = selectEvidenceSources(members, now).map(toPackedSource)
  const sources: PackedSource[] = selected.map((s) => ({
    ...s,
    body: stripMetaDump(s.body),
    title: stripMetaDump(s.title),
  }))

  const lines: string[] = [
    'EVENT',
    `canonical title: ${cluster.canonicalTitle || cluster.normalizedTopic || cluster.id}`,
    `event geography: ${[cluster.countryCode, cluster.region, cluster.city, cluster.district].filter(Boolean).join(' / ') || 'unknown'}`,
    `importance: ${cluster.importanceScore}`,
    `local importance: ${cluster.localImportance}`,
    `national importance: ${cluster.nationalImportance}`,
    `global importance: ${cluster.globalImportance}`,
    `material update status: ${cluster.hasMaterialUpdate ? 'true' : 'false'}`,
    '',
  ]

  sources.forEach((source, idx) => {
    lines.push(`SOURCE ${idx + 1}`)
    lines.push(`source name: ${source.sourceName}`)
    lines.push(`publishedAt: ${source.publishedAt ? source.publishedAt.toISOString() : 'unknown'}`)
    lines.push(`title: ${source.title}`)
    lines.push(`body: ${source.body}`)
    lines.push('')
  })

  return {
    clusterId: cluster.id,
    eventKey: cluster.eventKey,
    canonicalTitle: cluster.canonicalTitle || cluster.normalizedTopic || cluster.id,
    geography: {
      countryCode: cluster.countryCode,
      region: cluster.region,
      city: cluster.city,
      district: cluster.district,
      scope: cluster.geographicScopeHint ?? null,
    },
    importance: cluster.importanceScore,
    localImportance: cluster.localImportance,
    nationalImportance: cluster.nationalImportance,
    globalImportance: cluster.globalImportance,
    hasMaterialUpdate: cluster.hasMaterialUpdate,
    sources,
    packedText: lines.join('\n'),
  }
}

export function compressPackDeterministically(
  pack: EventAiPack,
  maxInputTokens: number,
  estimateTokens: (text: string) => number
): EventAiPack {
  let current = pack
  while (current.sources.length > 1 && estimateTokens(current.packedText) > maxInputTokens) {
    const dropped = current.sources.slice(0, -1)
    current = rebuild(current, dropped)
  }

  while (estimateTokens(current.packedText) > maxInputTokens && current.sources[0]) {
    const primary = current.sources[0]
    if (primary.body.length <= 400) break
    const keptNumeric = primary.body
      .split(/(?<=[.!?])\s+/)
      .filter((s, i, arr) => i < Math.ceil(arr.length * 0.7) || /\d/.test(s))
    let body = keptNumeric.join(' ')
    if (body.length > primary.body.length * 0.85) {
      body = primary.body.slice(0, Math.floor(primary.body.length * 0.7))
    }
    if (body.length >= primary.body.length) {
      body = primary.body.slice(0, Math.max(400, primary.body.length - 500))
    }
    current = rebuild(current, [{ ...primary, body }, ...current.sources.slice(1)])
    if (body.length <= 400) break
  }

  return current
}

function rebuild(pack: EventAiPack, sources: EventAiPack['sources']): EventAiPack {
  const next = { ...pack, sources, packedText: '' }
  const rebuilt = buildEventAiPack(
    {
      id: pack.clusterId,
      eventKey: pack.eventKey,
      canonicalTitle: pack.canonicalTitle,
      normalizedTopic: pack.canonicalTitle,
      countryCode: pack.geography.countryCode,
      region: pack.geography.region,
      city: pack.geography.city,
      district: pack.geography.district,
      aiEligibility: 'ELIGIBLE',
      importanceScore: pack.importance,
      localImportance: pack.localImportance,
      nationalImportance: pack.nationalImportance,
      globalImportance: pack.globalImportance,
      uniqueSourceCount: sources.length,
      freshnessScore: 0,
      hasMaterialUpdate: pack.hasMaterialUpdate,
      geographicScopeHint: pack.geography.scope,
    },
    sources.map((s) => ({
      articleId: s.articleId,
      sourceId: s.sourceId,
      sourceName: s.sourceName,
      qualityTier: 'TIER_A',
      healthScore: 80,
      extractionConfidence: 0.9,
      publishedAt: s.publishedAt,
      fetchedAt: s.publishedAt,
      title: s.title,
      body: s.body,
      description: null,
      contentHash: s.contentHash,
      wordCount: s.body.split(/\s+/).length,
      isExactDuplicate: false,
      editorialStatus: 'NEW',
      editorialNewsId: null,
      sourceStatus: 'ACTIVE',
    }))
  )
  return { ...next, sources: rebuilt.sources, packedText: rebuilt.packedText }
}
