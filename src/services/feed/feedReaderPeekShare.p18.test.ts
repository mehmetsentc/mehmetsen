/**
 * P18 — Feed Reader discovery peek + share path contracts.
 * Direction semantics frozen from 6567213 HUMAN PASS (LEFT open / RIGHT close).
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/firebase/auth', () => ({
  ensureAuthReady: vi.fn(async () => undefined),
  getClientAuthToken: vi.fn(async () => null as string | null),
  auth: { currentUser: null },
}))

import {
  classifyFeedOpenGestureDecision,
  dispatchFeedOpenGesture,
  shouldIgnoreFeedOpenGestureTarget,
} from '@/lib/feed/reader/feedOpenGesture'
import {
  feedToReaderProgress,
  isStillHoldMovement,
  READER_GESTURE,
  readerToFeedProgress,
} from '@/lib/feed/reader/gestureArbitration'
import {
  buildFacebookShareUrl,
  buildPostShareUrl,
  getSiteUrl,
} from '@/lib/seo'
import { SHARE_PLATFORMS } from '@/lib/shareUtils'

const root = process.cwd()
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('6567213 direction regression (do not reverse)', () => {
  const w = 390

  it('Feed LEFT opens; RIGHT does not', () => {
    expect(feedToReaderProgress(-160, w)).toBeCloseTo(160 / w)
    expect(feedToReaderProgress(160, w)).toBe(0)
    expect(
      classifyFeedOpenGestureDecision({
        dx: -160,
        dy: 4,
        startClientX: 300,
        viewportWidth: w,
        velocityX: -0.7,
      }).open
    ).toBe(true)
    expect(
      classifyFeedOpenGestureDecision({
        dx: 160,
        dy: 4,
        startClientX: 80,
        viewportWidth: w,
        velocityX: 0.7,
      }).open
    ).toBe(false)
  })

  it('Reader RIGHT closes; LEFT does not progress return', () => {
    expect(readerToFeedProgress(120, w)).toBeCloseTo(120 / w)
    expect(readerToFeedProgress(-120, w)).toBe(0)
  })

  it('wiring still enters Reader from RIGHT / underlay LEFT', () => {
    const client = read('src/components/feed/smart/SmartFeedClient.tsx')
    const reader = read('src/components/feed/smart/FeedArticleReader.tsx')
    expect(client).toContain('translate3d(${-pageProgress * 28}%')
    expect(reader).toContain('translate3d(${(1 - progress) * 100}%')
    expect(client).toContain('finger LEFT only (negative dx)')
    expect(reader).toContain('finger RIGHT only (positive dx)')
  })

  it('coach still teaches LEFT open', () => {
    const coach = read('src/components/feed/smart/SwipeDiscoveryCoach.tsx')
    expect(coach).toContain('Sola kaydır')
    expect(coach).not.toContain('Sağa kaydır veya dokun')
  })
})

describe('discovery peek (3–5% from RIGHT, single Reader)', () => {
  it('peek constants are subtle (not a large reveal)', () => {
    expect(READER_GESTURE.peekProgress).toBeGreaterThanOrEqual(0.03)
    expect(READER_GESTURE.peekProgress).toBeLessThanOrEqual(0.05)
    expect(READER_GESTURE.peekQualifyMs).toBeGreaterThanOrEqual(40)
    expect(READER_GESTURE.peekQualifyMs).toBeLessThanOrEqual(120)
    expect(isStillHoldMovement(0, 0)).toBe(true)
    expect(isStillHoldMovement(20, 0)).toBe(false)
  })

  it('FeedCardWithImpression arms peek via existing onOpenReaderProgress', () => {
    const client = read('src/components/feed/smart/SmartFeedClient.tsx')
    expect(client).toContain('READER_GESTURE.peekProgress')
    expect(client).toContain('READER_GESTURE.peekQualifyMs')
    expect(client).toContain('peekArmedRef')
    expect(client).toContain('onOpenReaderProgress?.(READER_GESTURE.peekProgress)')
    expect(client).toContain('key={`reader-${readerSession.generation}`}')
    expect(client).not.toContain('peekReaderSession')
  })

  it('interactive controls block peek/open start', () => {
    const button = { closest: (sel: string) => (sel.includes('button') ? button : null) }
    const video = { closest: (sel: string) => (sel.includes('video') ? video : null) }
    const blank = { closest: () => null }
    expect(shouldIgnoreFeedOpenGestureTarget(button as unknown as EventTarget)).toBe(true)
    expect(shouldIgnoreFeedOpenGestureTarget(video as unknown as EventTarget)).toBe(true)
    expect(shouldIgnoreFeedOpenGestureTarget(blank as unknown as EventTarget)).toBe(false)
  })

  it('LEFT drag still opens after peek qualify constants exist', () => {
    let n = 0
    expect(
      dispatchFeedOpenGesture({
        dx: -170,
        dy: 3,
        startClientX: 310,
        viewportWidth: 390,
        velocityX: -0.8,
        onOpen: () => {
          n += 1
        },
      })
    ).toBe(true)
    expect(n).toBe(1)
  })
})

describe('canonical share URLs (Feed V2 / Reader)', () => {
  const sample = { id: 'art-1', slug: 'turizm-ornek-haber' }

  it('buildPostShareUrl is public /haber/{slug}, never feed-v2?reader', () => {
    const url = buildPostShareUrl(sample)
    expect(url).toContain('/haber/turizm-ornek-haber')
    expect(url).not.toContain('feed-v2')
    expect(url).not.toContain('reader=')
    expect(url.startsWith('http')).toBe(true)
    expect(getSiteUrl().startsWith('http')).toBe(true)
  })

  it('Facebook / X / WhatsApp builders embed canonical URL', () => {
    const canonical = buildPostShareUrl(sample)
    const fb = buildFacebookShareUrl(canonical, 'Turizm')
    expect(fb).toContain('facebook.com')
    expect(fb).toContain(encodeURIComponent(canonical).slice(0, 40))
    expect(fb).not.toContain('display=popup')

    const x = SHARE_PLATFORMS.find((p) => p.id === 'x')!.getAction(canonical, 'Turizm')
    expect(x.type).toBe('link')
    if (x.type === 'link') {
      expect(x.href).toContain('twitter.com/intent/tweet')
      expect(x.href).toContain(encodeURIComponent(canonical))
    }

    const wa = SHARE_PLATFORMS.find((p) => p.id === 'whatsapp')!.getAction(canonical, 'Turizm')
    expect(wa.type).toBe('link')
    if (wa.type === 'link') {
      expect(wa.href).toContain('wa.me')
      expect(wa.href).toContain(encodeURIComponent(canonical))
    }
  })

  it('ShareMenu opens without sized popup features; copy uses canonical URL', () => {
    const menu = read('src/components/post/ShareMenu.tsx')
    expect(menu).toContain("window.open(action.href, '_blank', 'noopener,noreferrer')")
    expect(menu).not.toContain('width=600,height=400')
    expect(menu).toContain('await navigator.clipboard.writeText(url)')
    expect(menu).toContain("name !== 'AbortError'")
  })

  it('Reader uses post ShareButton + buildPostShareUrl authority', () => {
    const reader = read('src/components/feed/smart/FeedArticleReader.tsx')
    expect(reader).toContain('PostShareButton')
    expect(reader).toContain('slug={item.slug}')
    expect(reader).toContain('postId={item.articleId}')
    expect(reader).not.toContain('navigator.share({ title, url })')
    const shareBtn = read('src/components/post/ShareButton.tsx')
    expect(shareBtn).toContain('buildPostShareUrl')
  })

  it('comments zoom + generation invariants remain', () => {
    const comments = read('src/components/feed/smart/CommentsBottomSheet.tsx')
    expect(comments).toContain("fontSize: '16px'")
    const client = read('src/components/feed/smart/SmartFeedClient.tsx')
    expect(client).toContain('key={`reader-${readerSession.generation}`}')
    expect(client).toContain('discoveryCategory={item.category ?? category}')
  })
})
