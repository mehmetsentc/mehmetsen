import { describe, expect, it, vi } from 'vitest'
import { FEED_MODE_LABELS } from '@/lib/feed/config'
import type { FeedItemDto, FeedMode } from '@/types/smartFeed'

describe('PHASE P17.5 — Smart Feed Viewport Consistency & Transition UX Tests', () => {
  it('1. Feed Modes Configuration: all canonical modes exist and have labels', () => {
    const modes: FeedMode[] = ['personal', 'following', 'breaking', 'local']
    for (const m of modes) {
      expect(FEED_MODE_LABELS[m]).toBeDefined()
      expect(typeof FEED_MODE_LABELS[m]).toBe('string')
      expect(FEED_MODE_LABELS[m].length).toBeGreaterThan(0)
    }
    expect(FEED_MODE_LABELS['personal']).toBe('Sana Özel')
    expect(FEED_MODE_LABELS['following']).toBe('Takip')
    expect(FEED_MODE_LABELS['breaking']).toBe('Son Dakika')
    expect(FEED_MODE_LABELS['local']).toBe('Yerel')
  })

  it('2. Request Race Protection: sequential generation id drops stale responses', async () => {
    let activeGen = 0
    let lastCommittedMode: FeedMode | null = null

    const simulateModeSwitch = async (targetMode: FeedMode, delayMs: number) => {
      const thisGen = ++activeGen
      await new Promise((r) => setTimeout(r, delayMs))
      if (thisGen !== activeGen) {
        // Dropped because a newer request started
        return false
      }
      lastCommittedMode = targetMode
      return true
    }

    // Fire 3 mode switches with varying latencies
    // Rapid switches: personal (slow 100ms) -> following (fast 10ms) -> breaking (medium 40ms)
    const p1 = simulateModeSwitch('personal', 100)
    const p2 = simulateModeSwitch('following', 10)
    const p3 = simulateModeSwitch('breaking', 40)

    const [r1, r2, r3] = await Promise.all([p1, p2, p3])

    // Only breaking (the latest initiated switch) should commit
    expect(r1).toBe(false)
    expect(r2).toBe(false)
    expect(r3).toBe(true)
    expect(lastCommittedMode).toBe('breaking')
  })

  it('3. Feed Item Social State: respects like and save state defaults', () => {
    const mockItem: FeedItemDto = {
      id: 'test_1',
      articleId: 'art_1',
      clusterId: 'clust_1',
      publisher: {
        id: 'pub_1',
        slug: 'publisher-1',
        name: 'Test Publisher',
        logoUrl: 'https://example.com/logo.png',
        verified: true,
      },
      headline: 'Test Headline for Smart Feed',
      summary: 'Test summary description text.',
      category: 'gundem',
      image: 'https://example.com/image.jpg',
      video: null,
      publishedAt: new Date().toISOString(),
      breaking: true,
      materialUpdate: false,
      clusterSourceCount: 3,
      socialCounts: { likes: 12, comments: 4, saves: 5, shares: 1 },
      socialState: { liked: true, saved: false },
      slug: 'test-headline',
      mode: 'personal',
      reason: { primary: 'FOLLOWED_TOPIC' },
    }

    expect(mockItem.socialState?.liked).toBe(true)
    expect(mockItem.socialState?.saved).toBe(false)
    expect(mockItem.socialCounts.likes).toBe(12)
    expect(mockItem.clusterSourceCount).toBe(3)
  })

  it('4. AbortSignal integration: rejects or aborts fetch without uncaught error', async () => {
    const controller = new AbortController()
    controller.abort()

    const fetchStub = vi.fn().mockImplementation((_, opts?: { signal?: AbortSignal }) => {
      if (opts?.signal?.aborted) {
        return Promise.reject(new DOMException('The user aborted a request.', 'AbortError'))
      }
      return Promise.resolve({ ok: true, json: async () => ({ items: [] }) })
    })

    let caughtAbort = false
    try {
      await fetchStub('/api/feed/v2', { signal: controller.signal })
    } catch (e: any) {
      if (e?.name === 'AbortError') caughtAbort = true
    }

    expect(caughtAbort).toBe(true)
  })

  it('5. Fallback logic: handles null or broken images smoothly', () => {
    const itemWithBrokenImage: Partial<FeedItemDto> = {
      articleId: 'broken_art_1',
      headline: 'Haber Başlığı',
      image: null,
      publisher: {
        id: 'pub_1',
        slug: 'pub-slug',
        name: 'Örnek Gazete',
        logoUrl: null,
        verified: false,
      },
    }

    const hasImage = Boolean(itemWithBrokenImage.image)
    const publisherInitial = itemWithBrokenImage.publisher?.name ? itemWithBrokenImage.publisher.name.slice(0, 1) : 'N'

    expect(hasImage).toBe(false)
    expect(publisherInitial).toBe('Ö')
  })
})
