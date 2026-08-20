/**
 * Phase 4A.3 / 4B: public `/` still redirects to `/feed` and CMS
 * `publishedBlocks` (Global Layout) is not wired to the national homepage.
 *
 * Phase 4B decision: DO NOT wire live homepage in this local tranche.
 * Risk: national home is a large feed/host refactor; accidental wire would
 * change production UX without an acceptance gate.
 *
 * Precise follow-up plan (production acceptance separate):
 * 1. Feature flag `PUBLISHED_BLOCKS_HOME_ENABLED=false` (default).
 * 2. Keep city-host rendering untouched.
 * 3. Replace national `redirect(ROUTES.FEED)` in `src/app/page.tsx` with a
 *    published-layout renderer that reads `pageLayoutService.getPublished('national')`.
 * 4. Render only known block kinds via existing page-block components.
 * 5. Rollback = flip flag off OR restore previous layout version from CMS
 *    (Global Dizilim → Önceki Sürüme Dön already exists).
 * 6. Shadow / preview path first: `/admin/page-controls` preview must match
 *    public renderer before enabling flag.
 * 7. Acceptance: one national smoke test + city-host regression.
 */
export const PUBLISHED_BLOCKS_FOLLOWUP = {
  bundled: false,
  phase4bWired: false,
  reason: 'scoped_out_homepage_risk',
  publicHome: 'redirects_to_feed',
  publishedBlocksWired: false,
  plan: [
    'flag_PUBLISHED_BLOCKS_HOME_ENABLED_default_false',
    'national_only_renderer_from_pageLayoutService',
    'keep_city_hosts_unchanged',
    'preview_parity_before_enable',
    'rollback_via_flag_or_layout_version',
  ],
  files: [
    'src/app/page.tsx',
    'src/services/newsroomOs/pageLayoutService.ts',
    'src/app/admin/page-controls/page.tsx',
    'src/app/admin/global-layout/page.tsx',
  ],
} as const
