/**
 * Client-safe video embed helpers (cheerio yok).
 */
import { parseYouTubeVideoId } from '@/lib/postUtils'

/** iframe ile oynatılmalı mı, native <video> ile mi? */
export function isEmbedPlayerUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false
  if (/\.(mp4|webm|ogg|m4v|mov)(\?|$)/i.test(url)) return false
  if (/\.m3u8(\?|$)/i.test(url)) return false
  return (
    /youtube(?:-nocookie)?\.com\/embed|youtu\.be\//i.test(url) ||
    Boolean(parseYouTubeVideoId(url)) ||
    /player\.vimeo\.com\/video/i.test(url) ||
    /dailymotion\.com\/embed/i.test(url) ||
    /player\.twitch\.tv|clips\.twitch\.tv\/embed/i.test(url) ||
    /\/embed\//i.test(url) ||
    /twitter\.com\/i\/videos|x\.com\/i\/videos/i.test(url)
  )
}
