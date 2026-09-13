export const PROCESS_CONCURRENCY = 1
export const DEFAULT_PROCESS_TIMEOUT_MS = 180_000
export const MAX_STDERR_BYTES = 8_192
export const PLAYBACK_MAX_SHORT_EDGE = 720
export const PLAYBACK_MIME = 'video/mp4'
export const POSTER_MIME = 'image/webp'
export const ALLOWED_ORIGINAL_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
  'video/mpeg',
])
