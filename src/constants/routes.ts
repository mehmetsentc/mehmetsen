import { tagToSlug } from '@/lib/tags'

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  ONBOARDING: '/onboarding',
  FEED: '/feed',
  FEED_V2: '/feed-v2',
  EVENTS: '/events',
  REELS: '/reels',
  REELS_VIDEO: (id: string) => `/reels?v=${encodeURIComponent(id)}`,
  POST_CREATE: '/post/create',
  POST_DETAIL: (id: string) => `/post/${id}`,
  NEWS_DETAIL: (slug: string) => `/haber/${slug}`,
  POST_EDIT: (id: string) => `/post/${id}/edit`,
  PROFILE: (username: string) => `/profile/${username}`,
  USER_PROFILE: (username: string) => `/u/${encodeURIComponent(username)}`,
  SAVED: '/saved',
  BOOKMARKS: '/saved',
  SEARCH: '/search',
  /** Türkçe arama alias'ı — /search'e yönlendirilir */
  SEARCH_TR: '/ara',
  TAG: (slug: string) => `/etiket/${encodeURIComponent(tagToSlug(slug))}`,
  /** Topic alias — canonical etiket slug */
  TOPIC: (slug: string) => `/konu/${encodeURIComponent(tagToSlug(slug))}`,
  /** Event/cluster page — Phase P6 */
  EVENT: (slug: string) => `/olay/${encodeURIComponent(slug)}`,
  AUTHOR: (username: string) => `/yazar/${encodeURIComponent(username)}`,
  PUBLISHER: (slug: string) => `/publisher/${encodeURIComponent(slug)}`,
  /** Publisher media kit / sellable inventory interest page */
  PUBLISHER_REKLAM: (slug: string) => `/publisher/${encodeURIComponent(slug)}/reklam`,
  PUBLISHER_STUDIO: {
    ROOT: '/publisher-studio',
    PUBLISHER: (slug: string) => `/publisher-studio/${encodeURIComponent(slug)}`,
    PROFILE: (slug: string) => `/publisher-studio/${encodeURIComponent(slug)}/profile`,
    LAYOUT: (slug: string) => `/publisher-studio/${encodeURIComponent(slug)}/layout`,
    LAYOUT_EDIT: (slug: string) => `/publisher-studio/${encodeURIComponent(slug)}/layout/edit`,
    ARTICLES: (slug: string) => `/publisher-studio/${encodeURIComponent(slug)}/articles`,
    ARTICLE_NEW: (slug: string) => `/publisher-studio/${encodeURIComponent(slug)}/articles/new`,
    ARTICLE_EDIT: (slug: string, contentId: string) =>
      `/publisher-studio/${encodeURIComponent(slug)}/articles/${encodeURIComponent(contentId)}`,
    ARTICLE_PREVIEW: (slug: string, contentId: string) =>
      `/publisher-studio/${encodeURIComponent(slug)}/preview/${encodeURIComponent(contentId)}`,
    TEAM: (slug: string) => `/publisher-studio/${encodeURIComponent(slug)}/team`,
    ANALYTICS: (slug: string) => `/publisher-studio/${encodeURIComponent(slug)}/analytics`,
    ADS: (slug: string) => `/publisher-studio/${encodeURIComponent(slug)}/ads`,
    REVENUE: (slug: string) => `/publisher-studio/${encodeURIComponent(slug)}/revenue`,
  },
  MOST_READ: '/cok-okunanlar',
  LIVE: (slug: string) => `/canli/${encodeURIComponent(slug)}`,
  DISCOVER: '/discover',
  APP: '/uygulama',
  INFLUENCER: '/influencer',
  WEATHER: '/weather',
  GAMES: '/oyunlar',
  GAME: (slug: string) => `/oyunlar/${encodeURIComponent(slug)}`,
  LOCAL: '/yerel',
  LOCAL_CITY: (citySlug: string) => `/yerel/${encodeURIComponent(citySlug)}`,
  CATEGORY: (slug: string) => `/kategori/${slug}`,
  TEKNOLOJI: '/kategori/teknoloji',
  SPOR: '/kategori/spor',
  FOOTBALL: '/futbol-canli',
  /** NaHaber Skor — minimal Maçkolik (çoklu spor) */
  SKOR: '/skor',
  MUZELER: '/muzeler',
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
  /** City tenant routes (served on city subdomains) */
  CITY_FEED: '/',
  CITY_EVENTS: '/etkinlik',
  CITY_JOBS: '/is-ilanlari',
  CITY_JOBS_EMPLOYER: '/is-ilanlari/eleman-ariyorum',
  CITY_JOBS_SEEKER: '/is-ilanlari/is-ariyorum',
  CITY_SPOR: '/spor',
  CITY_DISTRICTS: '/ilceler',
  CITY_DUTY_PHARMACIES: '/nobetci-eczaneler',
  CITY_DUTY_PHARMACIES_DISTRICT: (districtSlug: string) =>
    `/nobetci-eczaneler/${districtSlug}`,
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
    MOST_READ: '/admin/most-read',
    SETTINGS: '/admin/settings',
    CATEGORIES: '/admin/categories',
    REPORTS: '/admin/reports',
    EVENTS: '/admin/events',
    ARCHIVE: '/admin/archive',
    SUBMISSIONS: '/admin/submissions',
    JOB_CLASSIFIEDS: '/admin/job-classifieds',
    INBOX: '/admin/inbox',
    NEWSLETTER: '/admin/newsletter',
    APPROVALS: '/admin/approvals',
    MENU: '/admin/menu',
    QUICK: '/admin/quick',
    SOCIAL: '/admin/social',
    SOCIAL_IMAGE: '/admin/social/gorsel',
    ADS: '/admin/ads',
    AI_EDITORS: '/admin/ai-editors',
    LIVE_CENTER: '/admin/live-center',
    AI_ORG: '/admin/ai-org',
    AI_AGENTS: '/admin/ai-agents',
    AI_TASKS: '/admin/ai-tasks',
    AI_MEMORY: '/admin/ai-memory',
    AI_LEARNING: '/admin/ai-learning',
    AI_MODELS: '/admin/ai-models',
    AI_USAGE: '/admin/ai-usage',
    CRAWLER: '/admin/crawler',
    PUBLISHERS: '/admin/publishers',
    CRAWLER_DISCOVER: '/admin/crawler/discover',
    CRAWLER_SOURCES: '/admin/crawler/sources',
    CRAWLER_ARTICLES: '/admin/crawler/raw-articles',
    AI_PERFORMANCE: '/admin/ai-performance',
    AI_LOGS: '/admin/ai-logs',
    AI_INSTRUCTIONS: '/admin/ai-instructions',
    LOCATIONS: '/admin/locations',
    SMM: '/admin/smm',
    SMM_QUEUE: '/admin/smm/queue',
    PAGE_CONTROLS: '/admin/page-controls',
    GLOBAL_LAYOUT: '/admin/global-layout',
    FEED_ALGORITHM: '/admin/feed-algorithm',
    SYSTEM_HEALTH: '/admin/system-health',
    AUDIT_LOGS: '/admin/audit-logs',
    ROLES: '/admin/roles',
    /** @deprecated Use ADMIN.NEWS */
    POSTS: '/admin/posts',
  },
} as const

export const PUBLIC_ROUTES: Set<string> = new Set([
  ROUTES.FEED,
  ROUTES.FEED_V2,
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
  if (pathname.startsWith('/feed-v2')) return true
  if (pathname.startsWith('/profile/')) return true
  if (pathname.startsWith('/u/')) return true
  if (pathname.startsWith('/kategori/')) return true
  if (pathname.startsWith('/haber/')) return true
  if (pathname.startsWith('/yerel')) return true
  if (pathname.startsWith('/events')) return true
  if (pathname.startsWith('/weather')) return true
  if (pathname.startsWith('/discover')) return true
  if (pathname.startsWith('/search')) return true
  if (pathname.startsWith('/ara')) return true
  if (pathname.startsWith('/etiket/')) return true
  if (pathname.startsWith('/yazar/')) return true
  if (pathname.startsWith('/canli/')) return true
  if (pathname === ROUTES.MOST_READ || pathname.startsWith('/cok-okunanlar')) return true
  if (pathname.startsWith('/influencer')) return true
  if (pathname.startsWith('/futbol-canli')) return true
  if (pathname.startsWith('/skor')) return true
  if (pathname.startsWith('/muzeler')) return true
  if (pathname.startsWith('/oyunlar')) return true
  if (pathname === ROUTES.SITE_MAP) return true
  if (pathname.startsWith('/hakkimizda')) return true
  if (pathname.startsWith('/iletisim')) return true
  if (pathname.startsWith('/hukuk/')) return true
  if (pathname.startsWith('/aydinlatma-metni')) return true
  if (pathname.startsWith('/editoryal-ilkeler')) return true
  if (pathname === '/kunye') return true
  if (pathname === ROUTES.LOGIN || pathname === ROUTES.REGISTER) return true
  if (pathname === ROUTES.APP) return true
  // City tenant routes are all public
  if (pathname === ROUTES.CITY_EVENTS || pathname.startsWith('/etkinlik')) return true
  if (pathname === ROUTES.CITY_JOBS || pathname.startsWith('/is-ilanlari')) return true
  if (pathname === ROUTES.CITY_SPOR) return true
  if (pathname === ROUTES.CITY_DISTRICTS || pathname.startsWith('/ilceler')) return true
  if (pathname === ROUTES.CITY_DUTY_PHARMACIES || pathname.startsWith('/nobetci-eczaneler')) return true
  return false
}
