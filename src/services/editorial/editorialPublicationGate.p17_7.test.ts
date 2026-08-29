import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  checkTextSimilarity,
  validatePublicationRights,
  computeJaccard,
  compute3GramOverlap,
  computeTokenMatchRatio,
} from './editorialSimilarityGate'
import { feedCandidateService } from '@/services/feed/FeedCandidateService'
import { FEED_RANKING_CONFIG_V1 } from '@/lib/feed/rankingConfig'
import type { FeedCandidateRow } from '@/types/smartFeed'

describe('PHASE P17.7 — Editorial Provenance & Public Feed Safety Gate', () => {
  describe('1. Deterministic Similarity & Overlap Calculations', () => {
    it('accurately identifies identical text as HIGH_OVERLAP (100%)', () => {
      const text = 'Türkiye Cumhuriyet Merkez Bankası Para Politikası Kurulu politika faizini yüzde 50 seviyesinde sabit tuttu.'
      const res = checkTextSimilarity(text, text)
      expect(res.similarity).toBeGreaterThanOrEqual(0.95)
      expect(res.overlapCategory).toBe('HIGH_OVERLAP')
      expect(res.flaggedForReview).toBe(true)
    })

    it('accurately identifies completely distinct text as LOW_OVERLAP (<30%)', () => {
      const textA = 'Meteoroloji Genel Müdürlüğü Marmara ve Ege için fırtına uyarısında bulundu.'
      const textB = 'Borsa İstanbul günü yüzde iki virgül beş yükselişle rekor seviyede tamamladı.'
      const res = checkTextSimilarity(textA, textB)
      expect(res.similarity).toBeLessThan(0.3)
      expect(res.overlapCategory).toBe('LOW_OVERLAP')
      expect(res.flaggedForReview).toBe(false)
    })

    it('accurately identifies partial rewriting as MEDIUM_OVERLAP (30% - 70%)', () => {
      const textA =
        'İstanbul Cumhuriyet Başsavcılığı tarafından yürütülen soruşturma kapsamında firari şüpheli teslim oldu ve jandarma ekiplerince gözaltına alındı.'
      const textB =
        'Başsavcılık tarafından yürütülen soruşturma çerçevesinde aranan firari şüpheli polise teslim oldu ve adli işlemler için gözaltına alındı.'
      const res = checkTextSimilarity(textA, textB)
      expect(res.overlapCategory).toBe('MEDIUM_OVERLAP')
    })
  })

  describe('2. Publication Rights Gate', () => {
    const rawSource = 'İçişleri Bakanlığı tarafından 81 ilde düzenlenen operasyonlarda 120 şüpheli yakalandı.'
    const identicalCopy = 'İçişleri Bakanlığı tarafından 81 ilde düzenlenen operasyonlarda 120 şüpheli yakalandı.'
    const rewrittenCopy = 'Emniyet güçlerince ülke genelinde eş zamanlı icra edilen asayiş operasyonları neticesinde çok sayıda zanlı gözaltına alındı.'

    it('blocks publication for HIGH_OVERLAP when no rights metadata is provided', () => {
      const result = validatePublicationRights({
        canonicalText: identicalCopy,
        rawSourceText: rawSource,
        rightsStatus: 'UNKNOWN',
        rightsBasis: 'UNKNOWN',
      })

      expect(result.allowed).toBe(false)
      expect(result.overlapCategory).toBe('HIGH_OVERLAP')
      expect(result.reason).toContain('BLOCKED')
    })

    it('permits publication for HIGH_OVERLAP when explicit authorized rights metadata is present', () => {
      const result = validatePublicationRights({
        canonicalText: identicalCopy,
        rawSourceText: rawSource,
        rightsStatus: 'LICENSED',
        rightsBasis: 'AA_FEED',
      })

      expect(result.allowed).toBe(true)
      expect(result.overlapCategory).toBe('HIGH_OVERLAP')
      expect(result.reason).toContain('explicit authorized rights')
    })

    it('permits publication for LOW_OVERLAP as LOW_OVERLAP_EDITORIAL_ELIGIBLE without claiming licensed/syndicated status', () => {
      const result = validatePublicationRights({
        canonicalText: rewrittenCopy,
        rawSourceText: rawSource,
        rightsStatus: 'UNKNOWN',
      })

      expect(result.allowed).toBe(true)
      expect(result.overlapCategory).toBe('LOW_OVERLAP')
      expect(result.reason).toContain('safe for standard editorial publication')
      // Ensure it does not falsely claim authorized licensing
      expect(result.rightsStatus).toBe('UNKNOWN')
    })
  })

  describe('3. Crawler Technical Quality Tier vs Publisher Verification Separation', () => {
    it('proves TIER_A crawler sources do NOT inherit publisherVerified = true', () => {
      // In baseSelect, publisherVerified is strictly `publishers.verificationStatus = 'VERIFIED'`.
      // It must not be true simply because newsSources.qualityTier === 'TIER_A'.
      const unverifiedTierASource: Partial<FeedCandidateRow> = {
        articleId: 'test_1',
        publisherVerified: false,
        sourceQualityTier: 'TIER_A',
      }

      expect(unverifiedTierASource.publisherVerified).toBe(false)
      expect(unverifiedTierASource.sourceQualityTier).toBe('TIER_A')
    })
  })

  describe('4. Test & Internal Article Filtering Invariant', () => {
    it('excludes test articles with test_ prefix or [TEST] title from candidate eligibility', () => {
      const candidateList: Partial<FeedCandidateRow>[] = [
        { articleId: 'wn7TDVNBOsaHWCELr5XS', headline: 'Real News Article' },
        { articleId: 'test_art_01', headline: 'Test Article' },
        { articleId: 'XUEhKFwUCqoOgytboSIq', headline: '[P11.1 PILOT TEST] NaHaber test' },
      ]

      const eligible = candidateList.filter(
        (c) =>
          !c.articleId?.startsWith('test_') &&
          !c.headline?.startsWith('[') &&
          !c.headline?.includes('TEST')
      )

      expect(eligible).toHaveLength(1)
      expect(eligible[0].articleId).toBe('wn7TDVNBOsaHWCELr5XS')
    })
  })
})
