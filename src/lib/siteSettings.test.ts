import { describe, expect, it } from 'vitest'
import { defaultSiteSettings, sanitizeSiteSettings, socialUrlList } from '@/lib/siteSettings'

describe('siteSettings', () => {
  it('fills defaults and rejects invalid urls/emails', () => {
    const clean = sanitizeSiteSettings({
      siteName: '  Na Haber  ',
      contactEmail: 'not-an-email',
      social: {
        x: 'javascript:alert(1)',
        facebook: 'https://www.facebook.com/nahabercom',
        instagram: '',
        youtube: 'ftp://bad',
      },
      notificationsEnabled: true,
    })
    expect(clean.siteName).toBe('Na Haber')
    expect(clean.contactEmail).toBe(defaultSiteSettings().contactEmail)
    expect(clean.social.x).toBe(defaultSiteSettings().social.x)
    expect(clean.social.facebook).toContain('facebook.com')
    expect(clean.notificationsEnabled).toBe(true)
    expect(socialUrlList(clean.social)).toHaveLength(4)
  })

  it('keeps cms flag keys and boolean values', () => {
    const clean = sanitizeSiteSettings({
      cmsFlags: {
        ...defaultSiteSettings().cmsFlags,
        autoPublishEnabled: true,
      },
    })
    expect(clean.cmsFlags.autoPublishEnabled).toBe(true)
    expect(clean.cmsFlags.aiNewsroomEnabled).toBe(true)
  })
})
