import { describe, expect, it } from 'vitest'
import { isAllowedVisionImageUrl } from '@/lib/ai/imageSeo'

describe('isAllowedVisionImageUrl', () => {
  it('allows Firebase Storage and known news image hosts', () => {
    expect(
      isAllowedVisionImageUrl(
        'https://firebasestorage.googleapis.com/v0/b/nahaber/o/posts%2Fphoto.jpg?alt=media'
      )
    ).toBe(true)
    expect(isAllowedVisionImageUrl('https://images.ntv.com.tr/news/photo.jpg')).toBe(true)
  })

  it('rejects local, metadata, insecure and unknown hosts', () => {
    expect(isAllowedVisionImageUrl('http://firebasestorage.googleapis.com/photo.jpg')).toBe(false)
    expect(isAllowedVisionImageUrl('https://127.0.0.1/photo.jpg')).toBe(false)
    expect(isAllowedVisionImageUrl('https://169.254.169.254/latest/meta-data')).toBe(false)
    expect(isAllowedVisionImageUrl('https://untrusted.example/photo.jpg')).toBe(false)
  })
})
