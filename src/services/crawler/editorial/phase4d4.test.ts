/**
 * Phase 4D.4 — quality policy + AI drafts CMS + publish firewall + drawer contracts.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildCanaryEvidencePack } from '../canary/pack'
import { validateCanaryDraft } from '../canary/validate'
import { computeSourceContentMetrics, evaluateBodyAgainstSources } from '../canary/sourcePolicy'
import { CANARY_BODY_TARGET_MIN_WORDS, wordCount } from '../canary/schema'
import { shouldAttemptPaidSchemaRepair } from '../canary/repairPolicy'
import { eventDraftPublicationAllowed } from '../eventDraft/executeEventDraft'
import { assessAiDraftQuality, formatAiCostUsd, DRAFT_QUALITY } from './aiDraftQuality'
import {
  aiDraftAutoPublishAllowed,
  assertHumanPublishCommand,
  filterSortPaginateJobs,
  isCompletedAiDraftJob,
  isFailedAiJob,
  mapJobToDetail,
  mapJobToListItem,
} from './aiDraftsQuery'
import type { CrawlerAiJobRecord } from '../aiDispatch/types'
import type { CanaryClusterInput, CanaryMemberInput } from '../canary/types'

function cluster(): CanaryClusterInput {
  return {
    id: 'cl_test',
    eventKey: 'ev_test',
    canonicalTitle: 'Test olay',
  }
}

function member(partial: Partial<CanaryMemberInput> & { articleId: string; sourceId: string; body: string }): CanaryMemberInput {
  return {
    sourceName: partial.sourceName || 'Kaynak',
    publishedAt: null,
    title: partial.title || 'Başlık',
    wordCount: partial.wordCount ?? wordCount(partial.body),
    ...partial,
  }
}

function richBody(n: number): string {
  return Array.from({ length: n }, (_, i) => `kelime${i}`).join(' ')
}

function buildMockValidDraftJson(overrides: { body?: string } = {}): string {
  const body = overrides.body || richBody(320)
  return JSON.stringify({
    title: 'Paraşütle uçaktan atılan 76 kunduz bölgenin kaderini değiştirdi',
    slug: 'parasutle-ucaktan-atilan-76-kunduz',
    spot: '1948 Idaho operasyonu ekosistemi değiştirdi ve sulak alanlar oluşturdu.',
    summary:
      'Idaho Balık ve Av Departmanı 1948 te kunduzları paraşütle bırakarak sulak alan restorasyonuna katkı sağladı ve etkileri sürdü.',
    body,
    tags: ['kunduz', 'idaho', 'ekosistem', 'sulak'],
    category: 'yerel-haber',
    seoTitle: 'Paraşütle Atılan Kunduzlar',
    seoDescription: '1948 Idaho kunduz operasyonu ve ekosistem etkileri hakkında kısa özet metin burada.',
    seoKeywords: ['kunduz', 'idaho'],
    socialTitle: 'Kunduzlar paraşütle atıldı',
    socialDescription: '1948 operasyonu sulak alanları güçlendirdi.',
    pushTitle: 'Kunduz operasyonu',
    pushText: '1948 Idaho kunduz bırakma operasyonu.',
    imageAlt: 'Paraşütle bırakılan kunduz kutusu',
    imageFilename: 'kunduz.jpg',
    readingTime: 2,
  })
}

function job(partial: Partial<CrawlerAiJobRecord> & { id: string; status: CrawlerAiJobRecord['status'] }): CrawlerAiJobRecord {
  return {
    clusterId: 'cl_b93c6db6-427a-46d8-81d3-0a27b83e73d4',
    eventKey: 'kunduz',
    dispatchType: 'INITIAL',
    priority: 1,
    eligibilityStatus: null,
    estimatedInputTokens: null,
    estimatedOutputTokens: null,
    estimatedTotalTokens: null,
    estimatedCostUsd: 0.0045,
    actualInputTokens: 1920,
    actualOutputTokens: 1626,
    actualCostUsd: 0.00299112,
    model: 'deepseek-v4-flash',
    provider: 'deepseek',
    attemptCount: 1,
    maxAttempts: 1,
    reservedAt: null,
    startedAt: new Date(),
    completedAt: new Date(),
    blockedReason: null,
    failureReason: null,
    editorialNewsId: 'draft_controlled_auto_draft_cl_b93c6db6-427a-46d8-81d3-0a27b83e73d4',
    outputTarget: 'EDITORIAL_DRAFT',
    selectedSourceCount: 1,
    draftSnapshot: null,
    validationSnapshot: null,
    createdAt: new Date('2026-08-20T22:46:24.000Z'),
    updatedAt: new Date(),
    ...partial,
  }
}

describe('Phase 4D.4 canonical quality policy', () => {
  it('258-word draft rejected when source material is rich (≥300 usable)', () => {
    const pack = buildCanaryEvidencePack(cluster(), [
      member({
        articleId: 'a1',
        sourceId: 's1',
        sourceName: 'Sözcü',
        body: richBody(400),
        wordCount: 400,
      }),
    ])
    const metrics = computeSourceContentMetrics(pack)
    expect(metrics.richness).toBe('rich')
    expect(metrics.bodyRequiredMinWords).toBe(CANARY_BODY_TARGET_MIN_WORDS)
    const body = richBody(258)
    const decision = evaluateBodyAgainstSources(body, pack)
    expect(decision.ok).toBe(false)
    expect(decision.code).toBe('BODY_TOO_SHORT')
    const v = validateCanaryDraft(JSON.parse(buildMockValidDraftJson({ body })), {
      allowRepair: true,
      pack,
    })
    expect(v.ok).toBe(false)
    expect(v.issues.some((i) => i.code === 'BODY_TOO_SHORT')).toBe(true)
  })

  it('thin-source legitimate short draft still passes', () => {
    const thin = richBody(120)
    const pack = buildCanaryEvidencePack(cluster(), [
      member({ articleId: 'a1', sourceId: 's1', body: thin, wordCount: 120 }),
    ])
    const metrics = computeSourceContentMetrics(pack)
    expect(['thin', 'medium']).toContain(metrics.richness)
    const shortOk = richBody(Math.max(metrics.bodyRequiredMinWords || 80, 100))
    const v = validateCanaryDraft(JSON.parse(buildMockValidDraftJson({ body: shortOk })), {
      allowRepair: true,
      pack,
    })
    expect(v.ok).toBe(true)
  })

  it('BODY_TOO_SHORT never triggers paid repair', () => {
    const decision = shouldAttemptPaidSchemaRepair({
      validationOk: false,
      issueCodes: ['BODY_TOO_SHORT'],
      jsonParseOk: true,
      alreadyRepaired: false,
      requestCount: 1,
      maxRequests: 2,
    })
    expect(decision.repair).toBe(false)
  })

  it('canary and auto path share validateCanaryDraft', () => {
    const pack = buildCanaryEvidencePack(cluster(), [
      member({ articleId: 'a1', sourceId: 's1', body: richBody(350), wordCount: 350 }),
    ])
    const ok = validateCanaryDraft(JSON.parse(buildMockValidDraftJson({ body: richBody(320) })), {
      pack,
    })
    const bad = validateCanaryDraft(JSON.parse(buildMockValidDraftJson({ body: richBody(258) })), {
      pack,
    })
    expect(ok.ok).toBe(true)
    expect(bad.ok).toBe(false)
  })

  it('kunduz-like 251 usable + 258 body → medium pass + QUALITY_WARNING on read', () => {
    const pack = buildCanaryEvidencePack(cluster(), [
      member({ articleId: 'a1', sourceId: 's1', body: richBody(251), wordCount: 251 }),
    ])
    expect(computeSourceContentMetrics(pack).richness).toBe('medium')
    const body = richBody(258)
    expect(evaluateBodyAgainstSources(body, pack).ok).toBe(true)
    const q = assessAiDraftQuality({
      body,
      usableSourceWords: 251,
      richness: 'medium',
    })
    expect(q.code).toBe(DRAFT_QUALITY.QUALITY_WARNING)
    expect(q.labelTr).toBe('Kalite Kontrolü Gerekli')
  })
})

describe('Phase 4D.4 AI drafts query', () => {
  const completed = job({
    id: 'aij_ok',
    status: 'COMPLETED',
    draftSnapshot: {
      draftId: 'draft_controlled_auto_draft_cl_b93c6db6-427a-46d8-81d3-0a27b83e73d4',
      title: 'Paraşütle uçaktan atılan 76 kunduz bölgenin kaderini değiştirdi',
      body: richBody(258),
      spot: 'spot',
      summary: 'summary',
      sourceEvidence: [
        {
          articleId: 'raw_a',
          sourceId: 'src_a',
          sourceName: 'Sözcü',
          role: 'PRIMARY',
          wordCount: 251,
        },
      ],
      cost: { actualCostUsd: 0.00299112 },
      packMetrics: { usableSourceWords: 251, richness: 'medium', sourceCount: 1 },
    },
  })
  const failed = job({
    id: 'aij_fail',
    status: 'FAILED',
    failureCode: 'PROVIDER_SUCCEEDED_FINALIZE_FAILED',
    draftSnapshot: null,
    editorialNewsId: null,
    actualCostUsd: 0.001,
  })

  it('list reads completed snapshot; failed excluded from completed tab', () => {
    expect(isCompletedAiDraftJob(completed)).toBe(true)
    expect(isFailedAiJob(failed)).toBe(true)
    const page = filterSortPaginateJobs([completed, failed], {
      tab: 'completed',
      page: 1,
      pageSize: 25,
      sort: 'createdAt',
      order: 'desc',
    })
    expect(page.total).toBe(1)
    expect(page.items[0]?.jobId).toBe('aij_ok')
    expect(page.items[0]?.title).toContain('kunduz')
  })

  it('draft detail exposes source evidence + cost rendering', () => {
    const detail = mapJobToDetail(completed)
    expect(detail.primarySource?.sourceName).toBe('Sözcü')
    expect(detail.costPrecise).toContain('0.00299112')
    expect(formatAiCostUsd(0.00299112).display).toBe('$0.0030')
    expect(detail.qualityCode).toBe(DRAFT_QUALITY.QUALITY_WARNING)
  })

  it('server pagination + sorting', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      job({
        id: `aij_${i}`,
        status: 'COMPLETED',
        actualCostUsd: i * 0.001,
        createdAt: new Date(Date.UTC(2026, 7, 20, 12, i)),
        draftSnapshot: {
          title: `T${i}`,
          body: richBody(300 + i),
          sourceEvidence: [{ sourceName: 'A', role: 'PRIMARY' }],
        },
      })
    )
    const page = filterSortPaginateJobs(many, {
      tab: 'completed',
      page: 2,
      pageSize: 25,
      sort: 'cost',
      order: 'desc',
    })
    expect(page.total).toBe(30)
    expect(page.items).toHaveLength(5)
    expect(page.page).toBe(2)
  })

  it('Turkish quality mapping', () => {
    const item = mapJobToListItem(completed)
    expect(item.statusLabelTr).toBe('Tamamlandı')
    expect(item.qualityLabelTr).toBe('Kalite Kontrolü Gerekli')
  })

  it('no auto publish; human publish firewall', () => {
    expect(aiDraftAutoPublishAllowed()).toBe(false)
    expect(eventDraftPublicationAllowed()).toBe(false)
    expect(
      assertHumanPublishCommand({
        authenticated: true,
        hasPublishPermission: true,
        explicitPublish: false,
        draftValid: true,
      }).ok
    ).toBe(false)
    expect(
      assertHumanPublishCommand({
        authenticated: true,
        hasPublishPermission: true,
        explicitPublish: true,
        draftValid: true,
      }).ok
    ).toBe(true)
  })
})

describe('Phase 4D.4 drawer + AI OFF worker contracts (source)', () => {
  const drawerSrc = readFileSync(
    resolve(__dirname, '../../../components/admin/crawler/RawArticleDrawer.tsx'),
    'utf8'
  )
  const pageSrc = readFileSync(
    resolve(__dirname, '../../../app/admin/crawler/raw-articles/page.tsx'),
    'utf8'
  )
  const workerSrc = readFileSync(resolve(__dirname, '../autoDraft/worker.ts'), 'utf8')

  it('drawer X ESC backdrop inside-click contracts', () => {
    expect(drawerSrc).toContain('data-drawer-close="true"')
    expect(drawerSrc).toContain("key === 'Escape'")
    expect(drawerSrc).toContain('data-drawer-backdrop="true"')
    expect(drawerSrc).toContain('e.stopPropagation()')
    expect(drawerSrc).toContain('aria-modal="true"')
  })

  it('stale fetch AbortController + A→B→A open path', () => {
    expect(pageSrc).toContain('AbortController')
    expect(pageSrc).toContain('ac.abort()')
    expect(pageSrc).toContain('openDrawer')
    expect(pageSrc).toContain('closeDrawer')
    expect(pageSrc).not.toMatch(/setTimeout\s*\(\s*.*openDrawer|setTimeout\s*\(\s*.*setDetail/)
  })

  it('scroll lock cleanup on unmount', () => {
    expect(drawerSrc).toContain('document.body.style.overflow = prevOverflow')
  })

  it('AI OFF worker does not claim without mode+provider', () => {
    expect(workerSrc).toContain('workerMayClaimNewJobs')
    expect(workerSrc).toContain('MODE_OR_DISPATCH_OFF')
    expect(workerSrc).toContain('PROVIDER_KILL_SWITCH_OFF')
    expect(workerSrc).toContain('eventDraftPublicationAllowed')
  })
})
