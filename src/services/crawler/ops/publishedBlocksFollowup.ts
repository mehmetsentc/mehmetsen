/**
 * Phase 4A.3 found public `/` still redirects to `/feed` and CMS
 * `publishedBlocks` (Global Layout) is not wired to the national homepage.
 *
 * This is a homepage/feed refactor, not an ingestion change. 4A.4 does not
 * bundle it. Follow-up: replace the national `redirect(ROUTES.feed)` in
 * `src/app/page.tsx` with a published-layout renderer, keep city-host
 * rendering, add rollback via env flag.
 */
export const PUBLISHED_BLOCKS_FOLLOWUP = {
  bundled: false,
  reason: 'large_homepage_feed_refactor',
  publicHome: 'redirects_to_feed',
  publishedBlocksWired: false,
  files: ['src/app/page.tsx', 'src/services/newsroomOs/pageLayoutService.ts', 'src/app/admin/page-controls/page.tsx'],
} as const
