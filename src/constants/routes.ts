// TODO: Implement in Phase 1
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  FEED: '/feed',
  POST_CREATE: '/post/create',
  POST_DETAIL: (id: string) => `/post/${id}`,
  POST_EDIT: (id: string) => `/post/${id}/edit`,
  PROFILE: (username: string) => `/profile/${username}`,
  SAVED: '/saved',
  SEARCH: '/search',
  NOTIFICATIONS: '/notifications',
  ADMIN: {
    DASHBOARD: '/admin/dashboard',
    USERS: '/admin/users',
    POSTS: '/admin/posts',
    REPORTS: '/admin/reports',
    CATEGORIES: '/admin/categories',
  },
} as const
