export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  ONBOARDING: '/onboarding',
  FEED: '/feed',
  EVENTS: '/events',
  REELS: '/reels',
  REELS_VIDEO: (id: string) => `/reels?v=${encodeURIComponent(id)}`,
  POST_CREATE: '/post/create',
  POST_DETAIL: (id: string) => `/post/${id}`,
  NEWS_DETAIL: (slug: string) => `/haber/${slug}`,
  POST_EDIT: (id: string) => `/post/${id}/edit`,
  PROFILE: (username: string) => `/profile/${username}`,
  SAVED: '/saved',
  BOOKMARKS: '/saved',
  SEARCH: '/search',
  DISCOVER: '/discover',
  APP: '/uygulama',
  INFLUENCER: '/influencer',
  WEATHER: '/weather',
  LOCAL: '/yerel',
  CATEGORY: (slug: string) => `/kategori/${slug}`,
  TEKNOLOJI: '/kategori/teknoloji',
  SPOR: '/kategori/spor',
  DUNYA: '/kategori/dunya',
  SAGLIK: '/kategori/saglik',
  EKONOMI: '/kategori/ekonomi',
  SIYASET: '/kategori/siyaset',
  NOTIFICATIONS: '/notifications',
  MESSAGES: '/messages',
  MESSAGES_CONVERSATION: (conversationId: string) => `/messages/${conversationId}`,
  SETTINGS: '/settings',
  SETTINGS_PRIVACY: '/settings/privacy',
  SETTINGS_NOTIFICATIONS: '/settings/notifications',
  SETTINGS_APPEARANCE: '/settings/appearance',
  SETTINGS_HELP: '/settings/help',
  SETTINGS_ABOUT: '/settings/about',
  SETTINGS_TERMS: '/settings/terms',
  SETTINGS_PRIVACY_POLICY: '/settings/privacy-policy',
  SETTINGS_PROFILE: '/settings/profile',
  SETTINGS_ACCOUNT_DELETE: '/settings/account/delete',
  FEED_CONTENT_POLICY: '/feed/kurallar',
  SITE_MAP: '/site-haritasi',
  ADMIN: {
    ROOT: '/admin',
    DASHBOARD: '/admin',
    NEWS: '/admin/news',
    NEWS_CREATE: '/admin/news/create',
    NEWS_EDIT: (id: string) => `/admin/news/${id}/edit`,
    VIDEOS: '/admin/videos',
    AUTHORS: '/admin/authors',
    EDITORS: '/admin/editors',
    USERS: '/admin/users',
    AI_NEWS: '/admin/ai/news',
    AI_VIDEO: '/admin/ai/video',
    NEWSROOM: '/admin/newsroom',
    SEO: '/admin/seo',
    CRON: '/admin/cron',
    API_MANAGEMENT: '/admin/api-management',
    ANALYTICS: '/admin/analytics',
    SETTINGS: '/admin/settings',
    CATEGORIES: '/admin/categories',
    REPORTS: '/admin/reports',
    EVENTS: '/admin/events',
    ARCHIVE: '/admin/archive',
    SUBMISSIONS: '/admin/submissions',
    /** @deprecated Use ADMIN.NEWS */
    POSTS: '/admin/posts',
  },
} as const

export const PUBLIC_ROUTES: Set<string> = new Set([
  ROUTES.FEED,
  ROUTES.EVENTS,
  ROUTES.REELS,
  ROUTES.LOCAL,
  ROUTES.SPOR,
  ROUTES.TEKNOLOJI,
  ROUTES.DUNYA,
  ROUTES.SAGLIK,
  ROUTES.EKONOMI,
  ROUTES.SIYASET,
])

// Giriş yapmadan erişilebilen sayfalar.
// Beğen/yorum/paylaş gibi aksiyonlarda useAuth devreye girer.
export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true
  if (pathname.startsWith('/profile/')) return true
  if (pathname.startsWith('/kategori/')) return true
  if (pathname.startsWith('/haber/')) return true
  if (pathname.startsWith('/yerel')) return true
  if (pathname.startsWith('/events')) return true
  if (pathname.startsWith('/weather')) return true
  if (pathname.startsWith('/discover')) return true
  if (pathname.startsWith('/search')) return true
  if (pathname.startsWith('/influencer')) return true
  if (pathname === ROUTES.SITE_MAP) return true
  if (pathname.startsWith('/hakkimizda')) return true
  if (pathname.startsWith('/iletisim')) return true
  return false
}
