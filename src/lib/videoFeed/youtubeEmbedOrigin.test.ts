import { describe, expect, it } from 'vitest'
import {
  youtubeEmbedParentOrigin,
  youtubeEmbedSrc,
} from '@/lib/videoFeed/youtubeEmbedOrigin'

describe('youtubeEmbedParentOrigin', () => {
  it('uses the real https parent origin so JS API commands are accepted', () => {
    expect(youtubeEmbedParentOrigin('https://www.nahaber.com')).toBe(
      'https://www.nahaber.com'
    )
    expect(youtubeEmbedParentOrigin('https://nahaber.com')).toBe('https://nahaber.com')
    expect(youtubeEmbedParentOrigin('https://nahaber.vercel.app')).toBe(
      'https://nahaber.vercel.app'
    )
  })

  it('falls back for Capacitor / non-http origins', () => {
    expect(youtubeEmbedParentOrigin('capacitor://localhost')).toBe(
      'https://www.nahaber.com'
    )
    expect(youtubeEmbedParentOrigin('')).toBe('https://www.nahaber.com')
    expect(youtubeEmbedParentOrigin(null)).toBe('https://www.nahaber.com')
  })
})

describe('youtubeEmbedSrc', () => {
  it('encodes the matching origin into the embed URL', () => {
    const src = youtubeEmbedSrc('dQw4w9wgGcQ', 'https://www.nahaber.com')
    expect(src).toContain('origin=https%3A%2F%2Fwww.nahaber.com')
    expect(src).toContain('enablejsapi=1')
    expect(src).toContain('mute=1')
    expect(src).not.toContain('origin=https://nahaber.com&')
  })
})
