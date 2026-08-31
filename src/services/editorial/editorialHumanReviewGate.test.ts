import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  evaluateEditorialApproval,
  assertHumanEditorialApproval,
  isAutomationIdentity,
  KNOWN_AUTOMATION_UIDS,
} from './humanReviewGate'
import { getNewsBySlug, getLegacyNewsBySlug } from '@/services/newsService.server'
import * as canonicalEligibility from '@/lib/canonical/canonicalEligibility'
import type { Post } from '@/types/post'

describe('Phase P17.8B — Canonical Authority & Human Editorial Review Gate Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Canonical Authority & Legacy Isolation', () => {
    it('returns null for Firestore-only legacy slugs on canonical getNewsBySlug', async () => {
      // Mock getCanonicalNewsBySlug returning null (not in PostgreSQL)
      vi.spyOn(canonicalEligibility, 'getCanonicalNewsBySlug').mockResolvedValue(null)

      const legacySlug = 'sandiklida-bicakli-kavga-17-yasindaki-muhammet-ali-saltik-hayatini-kaybetti'
      const canonicalResult = await getNewsBySlug(legacySlug)

      // Canonical authority is strictly PostgreSQL — Firestore is not consulted for /haber/[slug]
      expect(canonicalResult).toBeNull()
    })

    it('returns Post for valid PostgreSQL canonical published articles on getNewsBySlug', async () => {
      const mockPost: Partial<Post> = {
        id: 'IBeli7VLsE3OVfOKKRmu',
        slug: 'gunluk-burc-yorumlar-IBeli7VL',
        title: 'Günlük Burç Yorumları',
        status: 'published',
        visibility: 'public',
      }

      vi.spyOn(canonicalEligibility, 'getCanonicalNewsBySlug').mockResolvedValue(mockPost as Post)

      const result = await getNewsBySlug('gunluk-burc-yorumlar-IBeli7VL')
      expect(result).not.toBeNull()
      expect(result?.id).toBe('IBeli7VLsE3OVfOKKRmu')
      expect(result?.title).toBe('Günlük Burç Yorumları')
    })

    it('proves legacy helper getLegacyNewsBySlug is strictly decoupled from getNewsBySlug', () => {
      expect(typeof getLegacyNewsBySlug).toBe('function')
      expect(typeof getNewsBySlug).toBe('function')
      expect(getNewsBySlug).not.toBe(getLegacyNewsBySlug)
    })
  })

  describe('2. Automation & Bot Identity Detection', () => {
    it('identifies known historical automation UIDs as bots', () => {
      expect(isAutomationIdentity('ap3scBglLIVwflfZN4qL8PKrM1A3')).toBe(true)
      expect(isAutomationIdentity('editorial_ops')).toBe(true)
      expect(isAutomationIdentity('crawler_bot')).toBe(true)
      expect(isAutomationIdentity('ai_worker')).toBe(true)
      expect(isAutomationIdentity('deepseek')).toBe(true)
    })

    it('identifies bot prefixes as automation identities', () => {
      expect(isAutomationIdentity('bot_12345')).toBe(true)
      expect(isAutomationIdentity('ai_editor_v2')).toBe(true)
      expect(isAutomationIdentity('crawler_subsystem')).toBe(true)
      expect(isAutomationIdentity('service_worker_account')).toBe(true)
    })

    it('recognizes authentic human CMS UIDs as non-automation', () => {
      expect(isAutomationIdentity('usr_editor_human_123')).toBe(false)
      expect(isAutomationIdentity('mehmetsentc_auth_uid')).toBe(false)
      expect(isAutomationIdentity('firebase_human_editor_789')).toBe(false)
    })
  })

  describe('3. Human Editorial Review Gate Invariants', () => {
    it('rejects publication when reviewer identity is missing (UNREVIEWED)', () => {
      const evalResult = evaluateEditorialApproval({
        reviewerId: null,
        decision: 'APPROVED',
        reviewedAt: new Date(),
      })

      expect(evalResult.status).toBe('UNREVIEWED')
      expect(evalResult.reason).toContain('missing')

      expect(() =>
        assertHumanEditorialApproval({
          reviewerId: undefined,
          decision: 'APPROVED',
          reviewedAt: new Date(),
        })
      ).toThrowError(/EDITORIAL_GATE_REJECTED.*UNREVIEWED/)
    })

    it('rejects publication when candidate is explicitly REJECTED', () => {
      const evalResult = evaluateEditorialApproval({
        reviewerId: 'human_editor_01',
        decision: 'REJECTED',
        reviewedAt: new Date(),
        rejectionReason: 'Factual inaccuracy in body',
      })

      expect(evalResult.status).toBe('REJECTED')
      expect(evalResult.reason).toBe('Factual inaccuracy in body')

      expect(() =>
        assertHumanEditorialApproval({
          reviewerId: 'human_editor_01',
          decision: 'REJECTED',
          reviewedAt: new Date(),
        })
      ).toThrowError(/EDITORIAL_GATE_REJECTED.*REJECTED/)
    })

    it('rejects publication with bot/automation approval (BOT_APPROVED)', () => {
      const evalResult = evaluateEditorialApproval({
        reviewerId: 'ap3scBglLIVwflfZN4qL8PKrM1A3',
        decision: 'APPROVED',
        reviewedAt: new Date(),
      })

      expect(evalResult.status).toBe('BOT_APPROVED')
      expect(evalResult.reason).toContain('Automated or bot identity')

      expect(() =>
        assertHumanEditorialApproval({
          reviewerId: 'editorial_ops',
          decision: 'APPROVED',
          reviewedAt: new Date(),
        })
      ).toThrowError(/EDITORIAL_GATE_REJECTED.*BOT_APPROVED/)
    })

    it('rejects publication when decision is IN_REVIEW or NONE without explicit approval', () => {
      const evalInReview = evaluateEditorialApproval({
        reviewerId: 'human_editor_01',
        decision: 'IN_REVIEW',
        reviewedAt: new Date(),
      })
      expect(evalInReview.status).toBe('UNREVIEWED')

      const evalNone = evaluateEditorialApproval({
        reviewerId: 'human_editor_01',
        decision: 'NONE',
        reviewedAt: new Date(),
      })
      expect(evalNone.status).toBe('UNREVIEWED')
    })

    it('permits canonical publication when valid human approval is verified (HUMAN_APPROVED)', () => {
      const timestamp = new Date('2026-08-31T10:00:00.000Z')
      const evalResult = assertHumanEditorialApproval({
        reviewerId: 'human_editor_uid_456',
        reviewerDisplayName: 'Ahmet Editör',
        decision: 'APPROVED',
        reviewedAt: timestamp,
      })

      expect(evalResult.status).toBe('HUMAN_APPROVED')
      expect(evalResult.reviewerId).toBe('human_editor_uid_456')
      expect(evalResult.reviewedAt).toEqual(timestamp)
    })
  })
})
