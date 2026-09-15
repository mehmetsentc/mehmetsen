/**
 * Shared Feed V2 Reader presentation tokens for:
 * - FeedArticleReader overlay
 * - Canonical /haber SSR article (SEO body stays server-rendered)
 *
 * Behavior/gestures stay in FeedArticleReader — this is visual only.
 */
import { FEED_READER_CSS_VARS } from '@/lib/feed/reader/tokens'

export { FEED_READER_CSS_VARS }

/** Root class applied to /haber article column. */
export const ARTICLE_READER_SHELL_CLASS = 'article-reader-shell'

export const ARTICLE_READER_SHELL_TESTID = 'article-reader-shell'

/** Headline class aligned with Feed Reader serif display. */
export const ARTICLE_READER_HEADLINE_CLASS =
  'feed-reader-headline break-words font-serif font-bold leading-[1.08] tracking-[-0.025em] text-[color:var(--reader-page-text)] text-[clamp(1.875rem,8vw,2.625rem)]'

/** Spot / lead class aligned with Feed Reader. */
export const ARTICLE_READER_SPOT_CLASS =
  'feed-reader-spot break-words border-l-[3px] border-[color:var(--reader-accent)] pl-4 text-[1.25rem] font-semibold leading-[1.42] text-[color:var(--reader-prose-text)]'

/** Body prose class — Feed Reader body rhythm. */
export const ARTICLE_READER_BODY_CLASS =
  'feed-reader-body reader-body text-[length:var(--reader-body-size)] leading-[var(--reader-body-leading)] text-[color:var(--reader-prose-text)]'
