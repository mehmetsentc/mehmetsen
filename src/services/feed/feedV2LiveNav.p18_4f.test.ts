import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildFallbackFeedV2Tabs, buildFeedV2Tabs, parseFeedV2TabFromSearch } from '@/lib/feed/feedV2Tabs'
import { publisherAccentFromId } from '@/lib/feed/publisherAccent'
import { FEED_IMPRESSION_CONFIG } from '@/lib/feed/config'

describe('P18 feed-v2 live nav + card chrome', () => {
  it('lead tab is Sana Özel only; following is in fallback categories', () => {
    const tabs = buildFallbackFeedV2Tabs()
    expect(tabs[0]?.id).toBe('personal')
    expect(tabs.filter((t) => t.id === 'personal')).toHaveLength(1)
    expect(tabs.some((t) => t.id === 'following')).toBe(true)
    const freshness = buildFeedV2Tabs(['spor', 'ekonomi'])
    expect(freshness[0]?.id).toBe('personal')
    expect(freshness.findIndex((t) => t.id === 'spor')).toBeGreaterThan(0)
  })

  it('parseFeedV2TabFromSearch prefers category over mode', () => {
    const parsed = parseFeedV2TabFromSearch({ mode: 'following', category: 'spor' })
    expect(parsed.tabId).toBe('spor')
    expect(parsed.category).toBe('spor')
    expect(parsed.mode).toBe('personal')
  })

  it('publisher accent is deterministic', () => {
    expect(publisherAccentFromId('abc')).toBe(publisherAccentFromId('abc'))
    expect(publisherAccentFromId('abc')).not.toBe(publisherAccentFromId('xyz'))
  })

  it('SSR shell + category nav + discovery + mid-right social + CTA', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/(main)/feed-v2/page.tsx'), 'utf8')
    expect(page).toContain('smart-feed-ssr-shell')
    expect(page).toContain('feedService.getFeed')
    expect(page).toContain('initialPage')

    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('FeedV2CategoryNav')
    expect(client).toContain('showDiscoveryRail')
    expect(client).toContain('applyReaction')
    expect(client).toContain('isLoadingFirstTime = items.length === 0 && loading')
    expect(client).not.toContain('loading || authLoading')
    expect(client).toContain('smart-feed-tab-loading')
    expect(client).not.toMatch(/setItems\(\[\]\)\s*\n\s*setCursor/)

    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(card).toContain('smart-feed-social-dock')
    expect(card).toContain('Haberi Oku')
    expect(card).not.toMatch(/line-clamp/)
    expect(card).not.toContain('smart-feed-mid-copy')
    expect(card).toContain('FeedDiscoveryRail')
    expect(card).toContain('--feed-publisher-accent')
    expect(card).toContain('bg-gradient-to-t from-black')
    expect(card).not.toContain('FEED_INK_PANEL')

    const skins = readFileSync(join(process.cwd(), 'src/lib/feed/feedCardSkins.ts'), 'utf8')
    expect(skins).toContain('FEED_GLOBAL_HEADLINE_CLASS')
    expect(skins).toContain('FEED_GLOBAL_SUMMARY_CLASS')
    expect(skins).not.toMatch(/layout:\s*'center'/)

    const rail = readFileSync(
      join(process.cwd(), 'src/components/social/SocialActionRail.tsx'),
      'utf8'
    )
    expect(rail).toContain('smart-feed-reaction-picker')
    expect(rail).toContain('FEED_REACTION_OPTIONS')

    const discovery = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedDiscoveryRail.tsx'),
      'utf8'
    )
    expect(discovery).toContain('discovery_module_viewed')
    expect(discovery).toContain('discovery_card_opened')
  })

  it('qualified impression thresholds unchanged', () => {
    expect(FEED_IMPRESSION_CONFIG.visibilityRatio).toBe(0.6)
    expect(FEED_IMPRESSION_CONFIG.minVisibleMs).toBe(750)
  })

  it('reaction column migration is additive', () => {
    const sql = readFileSync(
      join(process.cwd(), 'src/db/migrations/0041_phase_feed_v2_article_reactions.sql'),
      'utf8'
    )
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "reaction"')
    expect(sql).toContain("DEFAULT 'LIKE'")
  })
})
