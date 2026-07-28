import { describe, expect, it } from 'vitest'
import { isDirectImageUrl, isLikelyVideoUrl } from '@/lib/adminVideoScrapeClient'

describe('isDirectImageUrl', () => {
  it('accepts extension-based images', () => {
    expect(isDirectImageUrl('https://cdn.example.com/photo.jpg')).toBe(true)
    expect(isDirectImageUrl('https://cdn.example.com/photo.PNG?w=800')).toBe(true)
  })

  it('accepts Google thumbnail URLs without file extension', () => {
    expect(
      isDirectImageUrl(
        'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT9LWEaxSnlOzZkPmmE'
      )
    ).toBe(true)
  })

  it('rejects youtube as image', () => {
    expect(isDirectImageUrl('https://www.youtube.com/watch?v=abc')).toBe(false)
    expect(isLikelyVideoUrl('https://www.youtube.com/watch?v=abc')).toBe(true)
  })
})
