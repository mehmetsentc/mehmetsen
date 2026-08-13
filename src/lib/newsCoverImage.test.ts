import { describe, expect, it } from 'vitest'
import {
  hasUsableCoverImage,
  NO_COVER_IMAGE_REASON,
  resolveCoverImageUrl,
} from './newsCoverImage'

describe('hasUsableCoverImage', () => {
  it('rejects empty / null / short', () => {
    expect(hasUsableCoverImage(undefined)).toBe(false)
    expect(hasUsableCoverImage(null)).toBe(false)
    expect(hasUsableCoverImage('')).toBe(false)
    expect(hasUsableCoverImage('   ')).toBe(false)
    expect(hasUsableCoverImage('http://')).toBe(false)
  })

  it('rejects non-http schemes', () => {
    expect(hasUsableCoverImage('/uploads/photo.jpg')).toBe(false)
    expect(hasUsableCoverImage('data:image/png;base64,abc')).toBe(false)
  })

  it('rejects known placeholders', () => {
    expect(hasUsableCoverImage('https://example.com/brand/nahaber-logo.png')).toBe(false)
    expect(hasUsableCoverImage('https://cdn.example.com/placeholder.jpg')).toBe(false)
  })

  it('accepts real http(s) image URLs', () => {
    expect(hasUsableCoverImage('https://cdn.example.com/news/photo.jpg')).toBe(true)
    expect(hasUsableCoverImage('http://img.aa.com.tr/i/12345.jpg')).toBe(true)
  })
})

describe('resolveCoverImageUrl', () => {
  it('prefers coverImageUrl then thumbnail', () => {
    expect(
      resolveCoverImageUrl({
        coverImageUrl: 'https://a.com/1.jpg',
        thumbnail: 'https://b.com/2.jpg',
      })
    ).toBe('https://a.com/1.jpg')
    expect(resolveCoverImageUrl({ thumbnail: 'https://b.com/2.jpg' })).toBe('https://b.com/2.jpg')
    expect(resolveCoverImageUrl({})).toBe('')
  })
})

describe('NO_COVER_IMAGE_REASON', () => {
  it('is the audit reason string', () => {
    expect(NO_COVER_IMAGE_REASON).toBe('görsel yok')
  })
})
