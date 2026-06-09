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
  NEWS_DETAIL: (slug: string) => `/news/${slug}`,
  POST_EDIT: (id: string) => `/post/${id}/edit`,
  PROFILE: (username: string) => `/profile/${username}`,
  SAVED: '/saved',
  BOOKMARKS: '/saved',
  SEARCH: '/search',
  DISCOVER: '/discover',
  INFLUENCER: '/influencer',
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
  FEED_CONTENT_POLICY: '/feed/kurallar',
  ADMIN: {
    ROOT: '/admin',
    DASHBOARD: '/admin/dashboard',
    NEWS: '/admin/news',
    NEWS_CREATE: '/admin/news/create',
    NEWS_EDIT: (id: string) => `/admin/news/${id}/edit`,
    CATEGORIES: '/admin/categories',
    USERS: '/admin/users',
    REPORTS: '/admin/reports',
    EVENTS: '/admin/events',
    ARCHIVE: '/admin/archive',
    SETTINGS: '/admin/settings',
    /** @deprecated Use ADMIN.NEWS */
    POSTS: '/admin/posts',
  },
} as const

export const PUBLIC_ROUTES: Set<string> = new Set([ROUTES.FEED, ROUTES.EVENTS, ROUTES.REELS])

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true
  if (pathname.startsWith('/profile/')) return true
  return false
}
