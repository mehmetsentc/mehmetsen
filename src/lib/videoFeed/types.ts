export type VideoFeedSurface = 'reels' | 'video'

export const VIDEO_FEED_MODES = [
  { id: 'for-you', label: 'Sana Özel', tab: 'for-you' },
  { id: 'yerel-haber', label: 'Yerel', tab: 'yerel-haber' },
  { id: 'gundem', label: 'Gündem', tab: 'gundem' },
] as const

export type VideoFeedModeId = (typeof VIDEO_FEED_MODES)[number]['tab']
