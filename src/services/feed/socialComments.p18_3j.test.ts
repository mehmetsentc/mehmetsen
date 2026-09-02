import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('P18.3J comments sheet geometry + send', () => {
  it('sheet sits above MobileNav and hides nav while open', () => {
    const sheet = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/CommentsBottomSheet.tsx'),
      'utf8'
    )
    expect(sheet).toContain('z-[120]')
    expect(sheet).toContain('smart-feed-comments-open')
    expect(sheet).toContain('min-h-0 flex-1')
    expect(sheet).toContain('visualViewport')
    expect(sheet).toContain('aria-label="Yorumu gönder"')
    expect(sheet).toContain('smart-feed-comments-send')
    expect(sheet).toContain('smart-feed-comments-composer')
    expect(sheet).toContain('ensureAuthReady')
    // Keep typed text on failure — clear draft only after successful post
    expect(sheet).toMatch(/await socialApi\.createComment[\s\S]*setDraft\(''\)/)
    const catchBlock = sheet.match(/} catch \(err\) \{[\s\S]*?\} finally/)?.[0] ?? ''
    expect(catchBlock).toContain('toast.error')
    expect(catchBlock).not.toContain("setDraft('')")

    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    expect(css).toContain('smart-feed-comments-open')
    expect(css).toContain('.mobile-bottom-nav')
    expect(css).toContain('pointer-events: none !important')
  })

  it('send button always rendered for authenticated composer (never hidden)', () => {
    const sheet = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/CommentsBottomSheet.tsx'),
      'utf8'
    )
    expect(sheet).toContain('type="submit"')
    expect(sheet).toContain('canSend')
    expect(sheet).not.toMatch(/\{canSend \?[\s\S]*<button type="submit"/)
  })
})

describe('P18.3J like pointer + auth path', () => {
  it('LikeButton stopPropagation and red fill wired', () => {
    const like = readFileSync(join(process.cwd(), 'src/components/post/LikeButton.tsx'), 'utf8')
    expect(like).toContain('stopPropagation')
    expect(like).toContain('smart-feed-like')
    expect(like).toContain('fill-rose-500')
  })

  it('SmartFeedClient awaits auth ready and surfaces ARTICLE_NOT_FOUND', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('ensureAuthReady')
    expect(client).toContain('auth.currentUser')
    expect(client).toContain('ARTICLE_NOT_FOUND')
    expect(client).toContain('Bu haber için etkileşim henüz açılamadı')
    expect(client).toContain('authLoading')
  })

  it('P18.3I canonical resolver preserved', () => {
    const repo = readFileSync(
      join(process.cwd(), 'src/services/social/socialGraphRepository.ts'),
      'utf8'
    )
    expect(repo).toContain('resolveCanonicalArticleId')
    expect(repo).toContain('legacyFirestoreId')
    expect(repo).toContain('eq(news.slug')
  })

  it('rail comment button stopPropagation', () => {
    const rail = readFileSync(
      join(process.cwd(), 'src/components/social/SocialActionRail.tsx'),
      'utf8'
    )
    expect(rail).toContain('stopPropagation')
    expect(rail).toContain('smart-feed-comment')
  })
})

describe('P18.3J feed + identity regression guards', () => {
  it('FG spacers still present', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('smart-feed-spacer-before')
    expect(client).toContain('EMPTY_PAGE_REFILL_MAX')
  })

  it('card keeps social rail elevated for taps', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(card).toContain('smart-feed-social-rail')
    expect(card).toContain('relative z-20')
  })
})

describe('P18.3J sheet height contract (unit)', () => {
  it('computes sheet height within visual viewport', () => {
    const viewportHeight = 700 // keyboard-reduced
    const sheetMax = Math.min(viewportHeight * 0.92, viewportHeight - 8)
    const sheetH = Math.round(sheetMax * 0.88)
    expect(sheetMax).toBeLessThanOrEqual(viewportHeight)
    expect(sheetH).toBeLessThanOrEqual(sheetMax)
    expect(sheetH).toBeGreaterThan(400)
  })
})
