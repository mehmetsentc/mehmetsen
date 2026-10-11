import { describe, expect, it } from 'vitest'
import { socialEligibility, type EligibilityHelpers } from './eligibility'

const h: EligibilityHelpers = {
  isOwnContent: (d) => !String(d.sourceUrl ?? '').startsWith('http') || String(d.sourceUrl).includes('nahaber.com'),
  isSkippableForSocial: (d) => d.isLive === true,
  extractImageUrl: (d) => (typeof d.thumbnail === 'string' ? d.thumbnail : undefined),
}
const base = { thumbnail: 'https://img.example/x.jpg', title: 't' }

describe('sosyal yayın uygunluğu', () => {
  it('kendi içerik uygundur', () => {
    expect(socialEligibility({ ...base }, h)).toEqual({ ok: true, basis: 'own_content' })
  })
  it('harici kaynak tek başına yasak değil ama karar yoksa inceleme ister; kaynak alanı değiştirilmez', () => {
    const d = { ...base, sourceUrl: 'https://baska.com/x' }
    const v = socialEligibility(d, h)
    expect(v).toMatchObject({ ok: false, code: 'needs_social_review' })
    if (!v.ok) expect(v.action).toContain('Sosyal yayına uygun')
    expect(d.sourceUrl).toBe('https://baska.com/x')
  })
  it('editör uygun + görsel hakkı → uygun; görsel hakkı yoksa uygun sayılmaz', () => {
    const d = { ...base, sourceUrl: 'https://baska.com/x' }
    expect(socialEligibility({ ...d, socialEligibility: { status: 'allowed', mediaRights: 'licensed' } }, h)).toMatchObject({ ok: true, basis: 'editor:licensed' })
    expect(socialEligibility({ ...d, socialEligibility: { status: 'allowed', mediaRights: 'whatever' } }, h)).toMatchObject({ ok: false, code: 'needs_social_review' })
  })
  it('editör engeli ve hak kararı kendi içeriği de durdurur', () => {
    expect(socialEligibility({ ...base, socialEligibility: { status: 'blocked' } }, h)).toMatchObject({ ok: false, code: 'social_blocked' })
    expect(socialEligibility({ ...base, rightsStatus: 'DO_NOT_PUBLISH' }, h)).toMatchObject({ ok: false, code: 'rights_blocked' })
    expect(socialEligibility({ ...base, rightsStatus: 'REWRITE_REQUIRED', socialEligibility: { status: 'allowed', mediaRights: 'own' } }, h)).toMatchObject({ ok: false, code: 'rights_blocked' })
  })
  it('video, canlı yayın ve görselsiz içerik hiçbir kararla otomatik gitmez', () => {
    const allowed = { socialEligibility: { status: 'allowed', mediaRights: 'own' } }
    expect(socialEligibility({ ...base, ...allowed, hasVideo: true }, h)).toMatchObject({ code: 'video_not_supported' })
    expect(socialEligibility({ ...base, ...allowed, isLive: true }, h)).toMatchObject({ code: 'not_suitable' })
    expect(socialEligibility({ title: 't', ...allowed }, h)).toMatchObject({ code: 'no_image' })
  })
})
