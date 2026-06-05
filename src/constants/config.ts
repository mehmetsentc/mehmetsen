// TODO: Implement in Phase 1
export const APP_CONFIG = {
  NAME: 'NaHaber',
  DESCRIPTION: 'Güncel haberleri takip et, paylaş ve tartış.',
  POSTS_PER_PAGE: 10,
  COMMENTS_PER_PAGE: 20,
  MAX_IMAGE_SIZE_MB: 2,
  MAX_VIDEO_SIZE_MB: 50,
  MAX_IMAGES_PER_POST: 5,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/webm'],
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
  POST_TITLE_MAX_LENGTH: 150,
  POST_SUMMARY_MAX_LENGTH: 200,
} as const

export const DEFAULT_CATEGORIES = [
  { id: 'gundem',    name: 'Gündem',    slug: 'gundem',    iconName: 'newspaper',  color: '#EF4444' },
  { id: 'teknoloji', name: 'Teknoloji', slug: 'teknoloji', iconName: 'cpu',        color: '#3B82F6' },
  { id: 'spor',      name: 'Spor',      slug: 'spor',      iconName: 'trophy',     color: '#10B981' },
  { id: 'ekonomi',   name: 'Ekonomi',   slug: 'ekonomi',   iconName: 'trending-up',color: '#F59E0B' },
  { id: 'kultur',    name: 'Kültür',    slug: 'kultur',    iconName: 'palette',    color: '#8B5CF6' },
  { id: 'saglik',    name: 'Sağlık',    slug: 'saglik',    iconName: 'heart',      color: '#EC4899' },
  { id: 'dunya',     name: 'Dünya',     slug: 'dunya',     iconName: 'globe',      color: '#6B7280' },
  { id: 'bilim',     name: 'Bilim',     slug: 'bilim',     iconName: 'flask',      color: '#14B8A6' },
] as const
