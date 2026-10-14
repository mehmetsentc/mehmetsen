import { describe, expect, it } from 'vitest'
import { bodyToBlocks, isPlainParagraphBody, isTabActive, shouldHideChrome } from './mobileAdminRules'

describe('MOBILE-ADMIN-1 rules', () => {
  it('keeps header + bottom bar on the approvals list, hides them in full-screen flows', () => {
    expect(shouldHideChrome('/admin/approvals')).toBe(false)
    expect(shouldHideChrome('/admin/approvals/')).toBe(false)
    expect(shouldHideChrome('/admin/approvals/abc123')).toBe(true)
    expect(shouldHideChrome('/admin/news/create')).toBe(true)
    expect(shouldHideChrome('/admin/news/abc/edit')).toBe(true)
    expect(shouldHideChrome('/admin/quick')).toBe(true)
    expect(shouldHideChrome('/admin/news')).toBe(false)
    expect(shouldHideChrome('/admin/social/shares')).toBe(false)
    expect(shouldHideChrome('/admin/editors')).toBe(false)
  })
  it('Haberler tab is active for the news list and approvals', () => {
    const news = { href: '/admin/news', also: ['/admin/approvals'] }
    expect(isTabActive('/admin/news', news)).toBe(true)
    expect(isTabActive('/admin/approvals', news)).toBe(true)
    expect(isTabActive('/admin/newsroom', news)).toBe(false)
    expect(isTabActive('/admin/menu', { href: '/admin', exact: true })).toBe(false)
    expect(isTabActive('/admin', { href: '/admin', exact: true })).toBe(true)
  })
  it('body text → paragraph blocks', () => {
    expect(bodyToBlocks('Bir.\nDevam\n\n  İki  \n\n\n')).toEqual([
      { id: 'm1', type: 'paragraph', text: 'Bir. Devam' },
      { id: 'm2', type: 'paragraph', text: 'İki' },
    ])
    expect(bodyToBlocks('   ')).toEqual([])
  })
  it('only plain-paragraph bodies are editable on the phone', () => {
    expect(isPlainParagraphBody({ bodyBlocks: [{ id: 'a', type: 'paragraph', text: 'x' }] })).toBe(true)
    expect(isPlainParagraphBody({ bodyBlocks: [{ id: 'a', type: 'image', url: 'https://x/y.jpg' }] })).toBe(false)
    expect(isPlainParagraphBody({ content: 'düz metin' })).toBe(true)
    expect(isPlainParagraphBody({ content: '<p>a</p><img src="x">' })).toBe(false)
  })
})
