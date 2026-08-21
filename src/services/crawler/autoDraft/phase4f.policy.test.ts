/**
 * Phase 4F policy — Design A invariants (unpaid).
 */
import { describe, expect, it } from 'vitest'
import {
  canCreateAutoDraftJob,
  evaluateAutoDraftGate,
  autoDraftMayPublish,
} from './eligibility'
import { autoDraftPublicationAllowed } from './pipeline'
import { MACHINE_DRAFT_ELIGIBILITY_LABELS, EDITORIAL_DECISION_LABELS } from '../editorial/labels'

describe('Phase 4F policy Design A', () => {
  it('NONE + AI_READY/AUTO_DRAFT_ELIGIBLE can create job when mode on', () => {
    const gate = evaluateAutoDraftGate({
      clusterAiEligibility: 'ELIGIBLE',
      editorialDecision: 'NONE',
      hasActiveAiJob: false,
      hasCompletedDraft: false,
      hasMaterialUpdate: false,
      bestWordCount: 400,
      independentSourceCount: 2,
      uniqueSourceCount: 2,
      staleHours: 1,
      exactDuplicateOnly: false,
      avgHealth: 80,
      bestConfidence: 0.9,
      hasLocalGeography: true,
      importanceScore: 50,
    })
    expect(gate.readyForJob).toBe(true)
    expect(
      canCreateAutoDraftJob({
        gate,
        editorialDecision: 'NONE',
        autoDraftModeEnabled: true,
        budgetOk: true,
        idempotencyOk: true,
      }).ok
    ).toBe(true)
  })

  it('machine label never equals editor approved copy', () => {
    expect(MACHINE_DRAFT_ELIGIBILITY_LABELS.AUTO_DRAFT_ELIGIBLE).not.toBe(
      EDITORIAL_DECISION_LABELS.APPROVED_FOR_AI
    )
    expect(MACHINE_DRAFT_ELIGIBILITY_LABELS.AUTO_DRAFT_ELIGIBLE.toLowerCase()).not.toContain(
      'editör onay'
    )
  })

  it('publication forever false', () => {
    expect(autoDraftPublicationAllowed()).toBe(false)
    expect(autoDraftMayPublish()).toBe(false)
  })
})
