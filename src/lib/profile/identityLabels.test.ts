import { describe, expect, it } from 'vitest'
import {
  editorIdentityLabel,
  publisherStatusLabel,
  publisherTrustLabel,
  publisherTypeLabel,
} from '@/lib/profile/identityLabels'

describe('profile identity labels', () => {
  it('labels publisher types without implying verification', () => {
    expect(publisherTypeLabel('NEWS_ORGANIZATION')).toBe('Haber kuruluşu')
    expect(publisherTypeLabel('LOCAL_MEDIA')).toBe('Yerel kaynak')
    expect(publisherTypeLabel('AGENCY')).toBe('Haber ajansı')
    expect(publisherTrustLabel('UNCLAIMED')).toBeNull()
    expect(publisherTrustLabel('PENDING')).toBeNull()
    expect(publisherTrustLabel('REJECTED')).toBeNull()
    expect(publisherTrustLabel('REVOKED')).toBeNull()
    expect(publisherTrustLabel('VERIFIED')).toBe('Doğrulanmış kaynak')
  })

  it('keeps claim state separate from a trust badge', () => {
    expect(publisherStatusLabel('UNCLAIMED')).toBe('Sahiplenilmemiş')
    expect(publisherStatusLabel('PENDING')).toBe('Doğrulama bekliyor')
    expect(publisherStatusLabel('VERIFIED')).toBeNull()
  })

  it('does not call an unverified human author a verified editor', () => {
    expect(editorIdentityLabel({ isVerified: false })).toBe('Yazar')
    expect(editorIdentityLabel({ isVerified: true })).toBe('Doğrulanmış editör')
    expect(editorIdentityLabel({ isAI: true, isVerified: false })).toBe('Yazar')
  })
})
