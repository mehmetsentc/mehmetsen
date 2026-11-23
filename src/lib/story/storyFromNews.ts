import 'server-only'

/**
 * HABERDEN-VIDEO — a news document → «Metinden Video» project draft.
 *
 * The headline, summary and body become the topic (the AI writes the narration in the
 * chosen video type from these facts only); the news item's own photos and its video
 * FILE (NaHaber storage, MP4 or HLS) become project media. YouTube / player pages are
 * never downloaded.
 */
import { reelSourceFromDoc } from '@/lib/reels/reelService'
import { TOPIC_MAX, CAPTION_MAX } from './storyProject'

export interface NewsStoryDraft {
  title: string
  topic: string
  caption: string
  photos: string[]
  video: string | null
}

const FACTS_NOTE = 'Bu bir NaHaber haberidir. Anlatımı yalnızca aşağıdaki bilgilerle yaz; isim, sayı, yer ve tarih ekleme ya da değiştirme.'

export function newsStoryDraft(d: Record<string, unknown>): NewsStoryDraft {
  const src = reelSourceFromDoc(d, { alwaysUseMedia: true })
  const title = src.headline.trim().slice(0, 140)
  const head = [FACTS_NOTE, `Başlık: ${title}`, src.summary ? `Özet: ${src.summary}` : '', src.place ? `Yer: ${src.place}` : ''].filter(Boolean).join('\n')
  const room = Math.max(0, TOPIC_MAX - head.length - 8)
  const body = (src.body ?? '').trim()
  const cut = body.length > room ? `${body.slice(0, room).replace(/\s+\S*$/, '')}…` : body
  const topic = body && room > 80 ? `${head}\nMetin: ${cut}` : head.slice(0, TOPIC_MAX)
  const caption = `${title}${src.summary ? `\n\n${src.summary}` : ''}\n\nHaberin tamamı nahaber.com'da.`.slice(0, CAPTION_MAX)
  const photos = [src.imageUrl, ...(src.imageUrls ?? [])].filter((u): u is string => !!u && /^https:\/\//i.test(u))
  const video = src.videoUrl && /^https:\/\//i.test(src.videoUrl) ? src.videoUrl : null
  return { title, topic, caption, photos: [...new Set(photos)].slice(0, 8), video }
}
