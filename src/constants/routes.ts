import { tagToSlug } from '@/lib/tags'

export const ROUTES = {
  HOME: '/',
  LOGIN: '/giris',
  REGISTER: '/kayit',
  ONBOARDING: '/onboarding',
  /** Anasayfa. Eski `/feed` 301 ile buraya düşer. */
  FEED: '/',
  FEED_LEGACY: '/feed',
  FEED_V2: '/feed-v2',
  FEED_V3: '/feed-v3',
  EVENTS: '/etkinlikler',
  REELS: '/reels',
  REELS_VIDEO: (id: string) => `/reels?v=${encodeURIComponent(id)}`,
  VIDEO: '/video',
  VIDEO_ITEM: (id: string) => `/video?v=${encodeURIComponent(id)}`,
  POST_CREATE: '/post/create',
  POST_DETAIL: (id: string) => `/post/${id}`,
  NEWS_DETAIL: (slug: string) => `/haber/${slug}`,
  POST_EDIT: (id: string) => `/post/${id}/edit`,
  PROFILE: (username: string) => `/profil/${encodeURIComponent(username)}`,
  USER_PROFILE: (username: string) => `/u/${encodeURIComponent(username)}`,
  SAVED: '/kaydedilenler',
  BOOKMARKS: '/kaydedilenler',
  SEARCH: '/ara',
  /** Eski İngilizce arama yolu — /ara'ya yönlendirilir */
  SEARCH_EN: '/search',
  /** @deprecated SEARCH ile aynı — geriye dönük */
  SEARCH_TR: '/ara',
  TAG: (slug: string) => `/etiket/${encodeURIComponent(tagToSlug(slug))}`,
  /** Topic alias — canonical etiket slug */
  TOPIC: (slug: string) => `/konu/${encodeURIComponent(tagToSlug(slug))}`,
  /** Event/cluster page — Phase P6 */
  EVENT: (slug: string) => `/olay/${encodeURIComponent(slug)}`,
  AUTHOR: (username: string) => `/yazar/${encodeURIComponent(username)}`,
  /** Kaynak profili — crawler/CMS kaynak adına göre haber listesi (yazar/uid gerektirmez). */
  SOURCE_PROFILE: (source: string) => `/kaynak/${encodeURIComponent(source)}`,
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
  DISCOVER: '/kesfet',
  APP: '/uygulama',
  INFLUENCER: '/fenomenler',
  WEATHER: '/hava-durumu',
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
  NOTIFICATIONS: '/bildirimler',
  MESSAGES: '/mesajlar',
  MESSAGES_CONVERSATION: (conversationId: string) => `/mesajlar/${encodeURIComponent(conversationId)}`,
  SETTINGS: '/ayarlar',
  SETTINGS_PRIVACY: '/ayarlar/gizlilik',
  SETTINGS_NOTIFICATIONS: '/ayarlar/bildirimler',
  SETTINGS_APPEARANCE: '/ayarlar/gorunum',
  SETTINGS_HELP: '/ayarlar/yardim',
  SETTINGS_ABOUT: '/ayarlar/hakkinda',
  SETTINGS_TERMS: '/ayarlar/kosullar',
  SETTINGS_PRIVACY_POLICY: '/ayarlar/gizlilik-politikasi',
  SETTINGS_PROFILE: '/ayarlar/profil',
  SETTINGS_ACCOUNT_DELETE: '/ayarlar/hesap/sil',
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
    VIDEO_QUEUE: '/admin/videos/queue',
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

export function isHomePathname(pathname: string): boolean {
  return pathname === '/' || pathname === '' || pathname === '/feed'
}

/** prefix === '/' için yalnızca anasayfa; diğerlerinde tam eşleşme veya alt yol. */
export function pathIs(pathname: string, ...prefixes: string[]): boolean {
  return prefixes.some((prefix) => {
    if (!prefix) return false
    if (prefix === '/') return isHomePathname(pathname)
    return pathname === prefix || pathname.startsWith(`${prefix}/`)
  })
}

export const PUBLIC_ROUTES: Set<string> = new Set([
  ROUTES.HOME,
  ROUTES.FEED,
  ROUTES.FEED_LEGACY,
  ROUTES.FEED_V2,
  ROUTES.FEED_V3,
  ROUTES.EVENTS,
  ROUTES.REELS,
  ROUTES.VIDEO,
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
  if (isHomePathname(pathname)) return true
  if (pathname === ROUTES.VIDEO || pathname.startsWith(`${ROUTES.VIDEO}/`)) return true
  if (pathname.startsWith('/feed-v2')) return true
  if (pathname.startsWith('/feed-v3')) return true
  if (pathIs(pathname, '/profil', '/profile')) return true
  if (pathname.startsWith('/publisher/')) return true
  if (pathname.startsWith('/u/')) return true
  if (pathname.startsWith('/kategori/')) return true
  if (pathname.startsWith('/haber/')) return true
  if (pathname.startsWith('/yerel')) return true
  if (pathIs(pathname, ROUTES.EVENTS, '/events')) return true
  if (pathIs(pathname, ROUTES.WEATHER, '/weather')) return true
  if (pathIs(pathname, ROUTES.DISCOVER, '/discover')) return true
  if (pathIs(pathname, ROUTES.SEARCH, '/search', '/ara')) return true
  if (pathname.startsWith('/etiket/')) return true
  if (pathname.startsWith('/yazar/')) return true
  if (pathname.startsWith('/canli/')) return true
  if (pathname === ROUTES.MOST_READ || pathname.startsWith('/cok-okunanlar')) return true
  if (pathIs(pathname, ROUTES.INFLUENCER, '/influencer')) return true
  if (pathname.startsWith('/futbol-canli')) return true
  if (pathname.startsWith('/skor')) return true
  if (pathname.startsWith('/muzeler')) return true
  if (pathname.startsWith('/oyunlar')) return true
  if (pathname === ROUTES.SITE_MAP) return true
  if (pathname.startsWith('/hakkimizda')) return true
  if (pathname.startsWith('/iletisim')) return true
  if (pathname.startsWith('/gizlilik')) return true
  if (pathname.startsWith('/hukuk/')) return true
  if (pathname.startsWith('/aydinlatma-metni')) return true
  if (pathname.startsWith('/editoryal-ilkeler')) return true
  if (pathname === '/kunye' || pathname === '/kune') return true
  if (pathname === '/video' || pathname.startsWith('/video/')) return true
  if (pathIs(pathname, ROUTES.LOGIN, '/login')) return true
  if (pathIs(pathname, ROUTES.REGISTER, '/register')) return true
  if (pathname === ROUTES.APP) return true
  // City tenant routes are all public
  if (pathname === ROUTES.CITY_EVENTS || pathname.startsWith('/etkinlik')) return true
  if (pathname === ROUTES.CITY_JOBS || pathname.startsWith('/is-ilanlari')) return true
  if (pathname === ROUTES.CITY_SPOR) return true
  if (pathname === ROUTES.CITY_DISTRICTS || pathname.startsWith('/ilceler')) return true
  if (pathname === ROUTES.CITY_DUTY_PHARMACIES || pathname.startsWith('/nobetci-eczaneler')) return true
  return false
}
