import { afterEach, describe, expect, it } from 'vitest'
import { evaluateCircuitBreaker } from '@/lib/ai/editorial/scaleCircuitBreaker'
import {
  isScalePublishLocked,
  nextScaleGateState,
  SCALE_UNLOCK_THRESHOLD,
  SCALE_INITIAL_MAX_DAILY_NEWS,
  SCALE_UNLOCKED_MAX_DAILY_NEWS,
} from '@/lib/ai/editorial/scaleHardening'
import { allWave1ProvinceCategorySpecs } from '@/lib/ai/editorial/seedProvinceCategoryEditors'
import { allWave2DistrictGeneralSpecs } from '@/lib/ai/editorial/seedDistrictEditors'
import { allWave3CountrySpecs } from '@/lib/ai/editorial/seedCountryEditors'
import { allSeedEditorSpecs } from '@/lib/ai/editorial/aiEditorService'
import { pickAiEditorFromList, aiEditorBlocksAutoPublish } from '@/lib/ai/editorial/editorRouter'
import {
  tripExpandedHierarchyCircuit,
  clearExpandedHierarchyCircuitForTests,
} from '@/lib/ai/editorial/scaleCircuitBreaker'
import { isExpandedEditorHierarchyEnabled } from '@/lib/ai/editorial/editorHierarchy'
import {
  DEFAULT_AI_CAPABILITIES,
  syntheticAiAuthorUid,
  type AiEditorDocument,
} from '@/types/aiEditor'

function fake(partial: Partial<AiEditorDocument> & Pick<AiEditorDocument, 'id' | 'slug' | 'name'>): AiEditorDocument {
  return {
    authorUid: syntheticAiAuthorUid(partial.slug),
    avatarUrl: null,
    coverUrl: null,
    title: 'Editör',
    shortBio: '',
    bio: '',
    columnName: null,
    primarySpecialization: 'Gündem',
    specializations: [],
    categoryIds: ['dunya'],
    languages: ['tr'],
    status: 'active',
    isAI: true,
    verified: true,
    capabilities: { ...DEFAULT_AI_CAPABILITIES },
    publishPolicy: 'REQUIRES_APPROVAL',
    maxDailyNews: SCALE_INITIAL_MAX_DAILY_NEWS,
    maxDailyColumns: 1,
    maxDailyVideos: 0,
    modelAssignments: {},
    preferredSourceIds: [],
    allowedSourceIds: [],
    assignableForNews: true,
    scaleHardened: true,
    autoPublishUnlockThreshold: SCALE_UNLOCK_THRESHOLD,
    consecutiveQualityGatePasses: 0,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    joinDate: 1,
    lastActiveAt: null,
    createdBy: 'test',
    ...partial,
  }
}

describe('SCALE P2 hardening + circuit', () => {
  afterEach(() => {
    clearExpandedHierarchyCircuitForTests()
    delete process.env.EXPANDED_EDITOR_HIERARCHY_ENABLED
    delete process.env.EXPANDED_EDITOR_HIERARCHY_CIRCUIT_OPEN
  })

  it('does not add Wave 1–3 grids to the live seed roster', () => {
    expect(allSeedEditorSpecs()).toHaveLength(132)
    expect(allWave1ProvinceCategorySpecs()).toHaveLength(790)
    expect(allWave2DistrictGeneralSpecs()).toHaveLength(973)
    expect(allWave3CountrySpecs()).toHaveLength(120)
    const roster = new Set(allSeedEditorSpecs().map((s) => s.slug))
    expect(allWave1ProvinceCategorySpecs().some((s) => roster.has(s.slug))).toBe(false)
  })

  it('keeps new desks in the approval queue until 20 consecutive PASS', () => {
    let editor = fake({ id: 'e1', slug: 'ulke-abd', name: 'ABD' })
    expect(isScalePublishLocked(editor)).toBe(true)
    expect(aiEditorBlocksAutoPublish(editor)).toBe(true)
    for (let i = 0; i < SCALE_UNLOCK_THRESHOLD - 1; i++) {
      const next = nextScaleGateState(editor, true)
      editor = { ...editor, ...next }
      expect(next.unlocked).toBe(false)
    }
    const unlocked = nextScaleGateState(editor, true)
    expect(unlocked.unlocked).toBe(true)
    expect(unlocked.publishPolicy).toBe('AUTO_PUBLISH')
    expect(unlocked.maxDailyNews).toBe(SCALE_UNLOCKED_MAX_DAILY_NEWS)
  })

  it('resets consecutive passes on FAIL', () => {
    const editor = fake({
      id: 'e1',
      slug: 'ulke-abd',
      name: 'ABD',
      consecutiveQualityGatePasses: 7,
    })
    const next = nextScaleGateState(editor, false)
    expect(next.consecutiveQualityGatePasses).toBe(0)
    expect(next.unlocked).toBe(false)
  })

  it('does not lock legacy editors without scaleHardened', () => {
    const editor = fake({
      id: 'defne',
      slug: 'defne-aksoy',
      name: 'Defne',
      scaleHardened: false,
      publishPolicy: 'AUTO_PUBLISH',
      maxDailyNews: 40,
    })
    expect(isScalePublishLocked(editor)).toBe(false)
    expect(aiEditorBlocksAutoPublish(editor)).toBe(false)
  })

  it('trips the circuit on high quality-gate fail rate and disables expanded routing', () => {
    process.env.EXPANDED_EDITOR_HIERARCHY_ENABLED = 'true'
    expect(isExpandedEditorHierarchyEnabled()).toBe(true)
    const decision = evaluateCircuitBreaker({
      qualityFailCount: 8,
      qualitySample: 12,
      usageErrorCount: 0,
      usageSample: 0,
      costUsdToday: null,
      costUsdBaselineDaily: null,
    })
    expect(decision.tripped).toBe(true)
    tripExpandedHierarchyCircuit(decision.reason ?? 'test')
    expect(isExpandedEditorHierarchyEnabled()).toBe(false)
  })

  it('does not trip on insufficient sample', () => {
    const decision = evaluateCircuitBreaker({
      qualityFailCount: 5,
      qualitySample: 5,
      usageErrorCount: 5,
      usageSample: 5,
      costUsdToday: 99,
      costUsdBaselineDaily: null,
    })
    expect(decision.tripped).toBe(false)
  })

  it('ignores expanded desks when the circuit is open even if the env flag is true', () => {
    process.env.EXPANDED_EDITOR_HIERARCHY_ENABLED = 'true'
    tripExpandedHierarchyCircuit('test trip')
    const country = fake({
      id: 'es',
      slug: 'ulke-ispanya',
      name: 'İspanya',
      editorLayer: 'country',
      countrySlug: 'ispanya',
      categoryIds: ['dunya'],
    })
    const defne = fake({
      id: 'defne',
      slug: 'defne-aksoy',
      name: 'Defne Aksoy',
      scaleHardened: false,
      publishPolicy: 'AUTO_PUBLISH',
      editorLayer: 'national',
      countrySlug: null,
      categoryIds: ['dunya'],
    })
    expect(
      pickAiEditorFromList([country, defne], { categoryId: 'dunya', countrySlug: 'ispanya' })?.slug
    ).toBe('defne-aksoy')
  })
})
