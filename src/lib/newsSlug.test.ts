import { describe, expect, it } from 'vitest'
import {
  buildNewsSlug,
  isPlaceholderDraftSlug,
  urlContainsDraftSlug,
} from '@/lib/newsSlug'
import {
  buildPublicArticleUrl,
  isPublicShareArticleUrl,
} from '@/lib/social/articleUrl'

describe('isPlaceholderDraftSlug', () => {
  it('flags empty and taslak placeholders', () => {
    expect(isPlaceholderDraftSlug('')).toBe(true)
    expect(isPlaceholderDraftSlug(null)).toBe(true)
    expect(isPlaceholderDraftSlug('taslak')).toBe(true)
    expect(isPlaceholderDraftSlug('taslak-lt4fhphn')).toBe(true)
    expect(isPlaceholderDraftSlug('ai-taslak-abc12345')).toBe(true)
    expect(isPlaceholderDraftSlug('haber-taslak')).toBe(true)
    expect(isPlaceholderDraftSlug('foo-taslak-bar')).toBe(true)
  })

  it('allows real SEO slugs', () => {
    expect(
      isPlaceholderDraftSlug('canakkalede-tarim-arazisine-dogalgaz-kuyusu-planlaniyor')
    ).toBe(false)
    expect(isPlaceholderDraftSlug('parasutle-ucaktan-atilan-76-kunduz')).toBe(false)
  })
})

describe('published article share URL must not contain taslak', () => {
  it('buildPublicArticleUrl rejects draft slug', () => {
    const url = buildPublicArticleUrl('lt4fhphnXXXX', {
      slug: 'taslak-lt4fhphn',
      title: "Çanakkale'de tarım arazisine doğalgaz kuyusu planlanıyor",
    })
    expect(url).toBeNull()
  })

  it('buildPublicArticleUrl uses SEO slug for published news', () => {
    const url = buildPublicArticleUrl('abc', {
      slug: 'canakkalede-tarim-arazisine-dogalgaz-kuyusu-planlaniyor',
      status: 'published',
    }, 'https://www.nahaber.com')
    expect(url).toBe(
      'https://www.nahaber.com/haber/canakkalede-tarim-arazisine-dogalgaz-kuyusu-planlaniyor'
    )
    expect(url).not.toMatch(/taslak/i)
    expect(isPublicShareArticleUrl(url)).toBe(true)
  })

  it('rejects stored draft url field', () => {
    const url = buildPublicArticleUrl('abc', {
      url: 'https://www.nahaber.com/haber/taslak-lt4fhphn',
      slug: 'canakkalede-tarim-arazisine-dogalgaz-kuyusu-planlaniyor',
    }, 'https://www.nahaber.com')
    // Prefer SEO slug when url is a draft path
    expect(url).toBe(
      'https://www.nahaber.com/haber/canakkalede-tarim-arazisine-dogalgaz-kuyusu-planlaniyor'
    )
  })

  it('urlContainsDraftSlug detects Haberi Oku draft links', () => {
    expect(
      urlContainsDraftSlug('https://www.nahaber.com/haber/taslak-lt4fhphn')
    ).toBe(true)
    expect(
      urlContainsDraftSlug(
        'https://www.nahaber.com/haber/canakkalede-tarim-arazisine-dogalgaz-kuyusu-planlaniyor'
      )
    ).toBe(false)
  })

  it('SEO slug from title is not a draft placeholder', () => {
    const slug = buildNewsSlug(
      "Çanakkale'de tarım arazisine doğalgaz kuyusu planlanıyor"
    )
    expect(isPlaceholderDraftSlug(slug)).toBe(false)
    expect(slug).not.toMatch(/taslak/i)
  })
})
