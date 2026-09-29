export const MEDIA_STUDIO_HREF = '/admin/media-studio'
export const MEDIA_STUDIO_LABEL = 'Medya Stüdyosu'

export function insertMediaStudioNav<T extends { href: string }>(items: T[], studioItem: T | null): T[] {
  const without = items.filter((item) => item.href !== MEDIA_STUDIO_HREF)
  if (!studioItem) return without
  const videosAt = without.findIndex((item) => item.href === '/admin/videos')
  const next = without.slice()
  next.splice(videosAt >= 0 ? videosAt + 1 : next.length, 0, studioItem)
  return next
}
