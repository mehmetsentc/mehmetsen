import { describe, expect, it } from 'vitest'
import { parseNewsImageHostname, shouldUseNextImage } from '@/lib/news/shouldUseNextImage'

describe('shouldUseNextImage', () => {
  it('refuses the live Discover evrensel.net thumbnail that next/image throws on', () => {
    const src = 'https://evrensel.net/images/840/upload/dosya/352915.jpg'
    expect(parseNewsImageHostname(src)).toBe('evrensel.net')
    expect(shouldUseNextImage(src)).toBe(false)
  })

  it('refuses other unknown RSS hosts from the Discover category payload', () => {
    expect(shouldUseNextImage('https://cdn.olay.com.tr/2026/09/feto-aa.jpg')).toBe(false)
    expect(shouldUseNextImage('https://indyturk.com/sites/default/files/x.jpg')).toBe(false)
    expect(shouldUseNextImage('https://foto.haberler.com/haber/x.jpg')).toBe(false)
  })

  it('allows only site-relative paths — even allowlisted CDNs skip next/image', () => {
    expect(shouldUseNextImage('https://images.ntv.com.tr/images/TEM-712453.jpg')).toBe(false)
    expect(shouldUseNextImage('/brand/nahaber-logo.png')).toBe(true)
  })

  it('refuses apex and subdomain RSS hosts that previously matched the allowlist', () => {
    expect(shouldUseNextImage('https://sozcu.com.tr/x.jpg')).toBe(false)
    expect(shouldUseNextImage('https://sozcu01.sozcu.com.tr/x.jpg')).toBe(false)
  })

  it('fails closed when the URL cannot be parsed instead of handing it to next/image', () => {
    expect(shouldUseNextImage('not a url')).toBe(false)
    expect(shouldUseNextImage('')).toBe(false)
    expect(shouldUseNextImage('  https://evrensel.net/x.jpg  ')).toBe(false)
  })
})
