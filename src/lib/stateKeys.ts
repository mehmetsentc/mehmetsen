/** Zustand persist names — bump suffix to invalidate stale client state. */
export const STORE_KEYS = {
  FEED: 'nahaber:feedStore:v1',
  UI: 'nahaber:uiStore:v1',
  PAGE: 'nahaber:pageState:v1',
} as const

/** AppStateContext / clientCache feed snapshot prefixes. */
export const CACHE_KEYS = {
  timeline: (categoryId: string | null) => `timeline:nahaber:${categoryId ?? 'all'}`,
  videoFeed: (mode: string, userId?: string) => `videoFeed:${mode}:${userId ?? 'guest'}`,
  newsDetail: (postId: string) => `news:detail:${postId}`,
} as const

/** usePageState keys — scoped per pathname via pageStateStore. */
export const PAGE_STATE_KEYS = {
  searchTab: 'searchTab',
  notifCategory: 'notifCategory',
  eventsCitySlug: 'eventsCitySlug',
  eventsCategory: 'eventsCategory',
  eventsUserPickedCity: 'eventsUserPickedCity',
  reelsFeedTab: 'reelsFeedTab',
  reelsActiveIndexByTab: 'reelsActiveIndexByTab',
  discoverSection: 'discoverSection',
  influencerPlatform: 'influencerPlatform',
  createPostType: 'createPostType',
  settingsQuery: 'settingsQuery',
  profileTab: 'profileTab',
  weatherCity: 'weatherCity',
  weatherSearchOpen: 'weatherSearchOpen',
  localCitySlug: 'localCitySlug',
  localUserPickedCity: 'localUserPickedCity',
  localCitySheetOpen: 'localCitySheetOpen',
  sidebarSearch: 'sidebarSearch',
} as const
