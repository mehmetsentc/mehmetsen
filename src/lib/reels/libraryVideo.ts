import 'server-only'

/**
 * REELS-T1 — a Video Kütüphanesi file as the media of a news reel («Video yükle»).
 * Only files that are in our own storage, finished importing, and rights-cleared
 * (OWNED / LICENSED / PARTNER) can be used; anything else is refused.
 */
import { eq } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { videoLibraryItems } from '@/db/schema/videoLibrary'
import { getMediaUrl } from '@/lib/storage'

const USABLE_STATUS = new Set(['READY', 'PROCESSING', 'PLAYBACK_READY'])
const USABLE_RIGHTS = new Set(['OWNED', 'LICENSED', 'PARTNER', 'PERMISSION_GRANTED'])

export function isVideoItemId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(v)
}

export async function libraryVideoForReel(id: string): Promise<{ url: string; title: string } | { error: string }> {
  if (!isVideoItemId(id)) return { error: 'videoItemId geçersiz' }
  if (!hasDatabaseUrl()) return { error: 'Video kütüphanesi bu ortamda yok' }
  const [row] = await getDb().select().from(videoLibraryItems).where(eq(videoLibraryItems.id, id)).limit(1)
  if (!row) return { error: 'Video bulunamadı' }
  if (!USABLE_STATUS.has(row.status)) return { error: 'Video henüz hazır değil' }
  if (!USABLE_RIGHTS.has(row.rightsStatus)) return { error: 'Videonun yayın hakkı onaylı değil (OWNED / LICENSED / PARTNER gerekli)' }
  const key = row.playbackStorageKey || row.originalStorageKey
  const url = getMediaUrl(key)
  if (!url) return { error: 'Videonun dosyası yok' }
  return { url, title: row.title }
}
