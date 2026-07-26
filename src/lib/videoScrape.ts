/**
 * Video scrape / resolve
 *
 * Haber editörüne yapıştırılan URL'den oynatılabilir video çıkarır:
 *  - Doğrudan YouTube / Vimeo / Dailymotion / Twitch / MP4 / HLS
 *  - Haber veya başka sayfa HTML'inden (og:video, JSON-LD, iframe, <video>)
 *
 * Dosya indirme (Storage) bu katmanda yapılmaz — API route karar verir.
 */
import * as cheerio from 'cheerio'
import { parseYouTubeVideoId } from '@/lib/postUtils'

export type VideoProvider =
  | 'youtube'
  | 'vimeo'
  | 'dailymotion'
  | 'twitch'
  | 'mp4'
  | 'hls'
  | 'embed'
  | 'unknown'

export interface ScrapedVideo {
  provider: VideoProvider
  /** Habere kaydedilecek oynatma URL'si (embed tercih edilir) */
  playUrl: string
  /** Canonical / watch URL */
  watchUrl: string
  embedUrl: string | null
  thumbnailUrl: string | null
  title: string | null
  /** Doğrudan dosya indirilip Storage'a alınabilir mi? */
  downloadable: boolean
  /** Kaynak: doğrudan URL mi, sayfa scrape mi */
  source: 'direct' | 'page' | 'oembed'
  pageUrl?: string
}

export interface ScrapeVideoResult {
  ok: true
  video: ScrapedVideo
  /** Aynı sayfada bulunan diğer adaylar (en iyi seçim dışında) */
  alternatives: ScrapedVideo[]
}

export interface ScrapeVideoError {
  ok: false
  error: string
}

const FETCH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Referer: 'https://www.google.com/',
}

const MAX_HTML_BYTES = 500_000
const FETCH_TIMEOUT_MS = 15_000

function absUrl(raw: string, base: string): string | null {
  const cleaned = raw.trim().replace(/&amp;/g, '&')
  if (!cleaned || cleaned.startsWith('data:')) return null
  try {
    return new URL(cleaned, base).href
  } catch {
    return null
  }
}

function youtubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}

function youtubeEmbed(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}`
}

function youtubeWatch(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`
}

function scoreProvider(p: VideoProvider): number {
  switch (p) {
    case 'youtube':
      return 100
    case 'vimeo':
      return 90
    case 'dailymotion':
      return 85
    case 'twitch':
      return 80
    case 'mp4':
      return 70
    case 'hls':
      return 60
    case 'embed':
      return 40
    default:
      return 10
  }
}

function makeVideo(partial: Omit<ScrapedVideo, 'downloadable'> & { downloadable?: boolean }): ScrapedVideo {
  const downloadable =
    partial.downloadable ??
    (partial.provider === 'mp4' ||
      (partial.provider === 'hls' && /\.m3u8(\?|$)/i.test(partial.playUrl)))
  return { ...partial, downloadable }
}

/** Doğrudan bilinen platform / dosya URL'si mi? */
export function resolveDirectVideoUrl(rawUrl: string): ScrapedVideo | null {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    return null
  }

  const href = url.href
  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  const path = url.pathname

  // YouTube
  const ytId = parseYouTubeVideoId(href)
  if (ytId) {
    return makeVideo({
      provider: 'youtube',
      playUrl: youtubeEmbed(ytId),
      watchUrl: youtubeWatch(ytId),
      embedUrl: youtubeEmbed(ytId),
      thumbnailUrl: youtubeThumb(ytId),
      title: null,
      source: 'direct',
      downloadable: false,
    })
  }

  // Vimeo
  const vimeoMatch =
    host.includes('vimeo.com') &&
    path.match(/\/(?:video\/)?(\d{6,})/)
  if (vimeoMatch) {
    const id = vimeoMatch[1]
    const embed = `https://player.vimeo.com/video/${id}`
    return makeVideo({
      provider: 'vimeo',
      playUrl: embed,
      watchUrl: `https://vimeo.com/${id}`,
      embedUrl: embed,
      thumbnailUrl: null,
      title: null,
      source: 'direct',
      downloadable: false,
    })
  }

  // Dailymotion
  const dmMatch =
    (host.includes('dailymotion.com') || host === 'dai.ly') &&
    (path.match(/\/video\/([a-zA-Z0-9]+)/) || path.match(/^\/([a-zA-Z0-9]+)$/))
  if (dmMatch) {
    const id = dmMatch[1]
    const embed = `https://www.dailymotion.com/embed/video/${id}`
    return makeVideo({
      provider: 'dailymotion',
      playUrl: embed,
      watchUrl: `https://www.dailymotion.com/video/${id}`,
      embedUrl: embed,
      thumbnailUrl: null,
      title: null,
      source: 'direct',
      downloadable: false,
    })
  }

  // Twitch clip / video
  if (host.includes('twitch.tv') || host.includes('clips.twitch.tv')) {
    const clip = path.match(/\/clip\/([A-Za-z0-9_-]+)/) || href.match(/[?&]clip=([A-Za-z0-9_-]+)/)
    const vod = path.match(/\/videos\/(\d+)/)
    if (clip) {
      const embed = `https://clips.twitch.tv/embed?clip=${clip[1]}&parent=nahaber.com`
      return makeVideo({
        provider: 'twitch',
        playUrl: embed,
        watchUrl: href,
        embedUrl: embed,
        thumbnailUrl: null,
        title: null,
        source: 'direct',
        downloadable: false,
      })
    }
    if (vod) {
      const embed = `https://player.twitch.tv/?video=${vod[1]}&parent=nahaber.com`
      return makeVideo({
        provider: 'twitch',
        playUrl: embed,
        watchUrl: href,
        embedUrl: embed,
        thumbnailUrl: null,
        title: null,
        source: 'direct',
        downloadable: false,
      })
    }
  }

  // Direct media file
  const lowerPath = path.toLowerCase()
  if (/\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(lowerPath) || /\.(mp4|webm|mov)(\?|$)/i.test(href)) {
    return makeVideo({
      provider: 'mp4',
      playUrl: href,
      watchUrl: href,
      embedUrl: null,
      thumbnailUrl: null,
      title: null,
      source: 'direct',
      downloadable: true,
    })
  }
  if (/\.m3u8(\?|$)/i.test(lowerPath)) {
    return makeVideo({
      provider: 'hls',
      playUrl: href,
      watchUrl: href,
      embedUrl: null,
      thumbnailUrl: null,
      title: null,
      source: 'direct',
      downloadable: false,
    })
  }

  return null
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    // Direct video Content-Type
    if (ct.startsWith('video/')) {
      return null // handled by caller via HEAD/content-type path
    }
    if (!ct.includes('html') && !ct.includes('xml') && !ct.includes('text/')) {
      return null
    }

    const reader = res.body?.getReader()
    if (!reader) return null
    let html = ''
    let bytes = 0
    const dec = new TextDecoder('utf-8', { fatal: false })
    while (bytes < MAX_HTML_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      html += dec.decode(value, { stream: true })
      bytes += value?.byteLength ?? 0
    }
    void reader.cancel()
    return html.length > 200 ? html : null
  } catch {
    return null
  }
}

async function probeContentType(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: FETCH_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
    })
    return res.headers.get('content-type')
  } catch {
    return null
  }
}

function metaContent($: cheerio.CheerioAPI, ...keys: string[]): string | null {
  for (const key of keys) {
    const byProp = $(`meta[property="${key}"]`).attr('content')?.trim()
    if (byProp) return byProp
    const byName = $(`meta[name="${key}"]`).attr('content')?.trim()
    if (byName) return byName
  }
  return null
}

function pushCandidate(list: ScrapedVideo[], candidate: ScrapedVideo | null) {
  if (!candidate?.playUrl) return
  if (list.some((v) => v.playUrl === candidate.playUrl || v.watchUrl === candidate.watchUrl)) return
  list.push(candidate)
}

function extractFromHtml(html: string, pageUrl: string): ScrapedVideo[] {
  const $ = cheerio.load(html)
  const found: ScrapedVideo[] = []
  const pageTitle =
    metaContent($, 'og:title', 'twitter:title') ||
    $('title').first().text().trim() ||
    null
  const pageImage = metaContent($, 'og:image', 'twitter:image') || null

  // Open Graph / Twitter video
  for (const key of ['og:video', 'og:video:url', 'og:video:secure_url', 'twitter:player:stream']) {
    const raw = metaContent($, key)
    if (!raw) continue
    const abs = absUrl(raw, pageUrl)
    if (!abs) continue
    const direct = resolveDirectVideoUrl(abs)
    if (direct) {
      pushCandidate(found, {
        ...direct,
        title: direct.title || pageTitle,
        thumbnailUrl: direct.thumbnailUrl || pageImage,
        source: 'page',
        pageUrl,
      })
    } else if (/\.(mp4|webm|m3u8)(\?|$)/i.test(abs)) {
      pushCandidate(
        found,
        makeVideo({
          provider: abs.includes('.m3u8') ? 'hls' : 'mp4',
          playUrl: abs,
          watchUrl: abs,
          embedUrl: null,
          thumbnailUrl: pageImage,
          title: pageTitle,
          source: 'page',
          pageUrl,
        })
      )
    }
  }

  // twitter:player / og:video:type embed pages
  const player = metaContent($, 'twitter:player')
  if (player) {
    const abs = absUrl(player, pageUrl)
    if (abs) {
      const direct = resolveDirectVideoUrl(abs)
      if (direct) {
        pushCandidate(found, {
          ...direct,
          title: direct.title || pageTitle,
          thumbnailUrl: direct.thumbnailUrl || pageImage,
          source: 'page',
          pageUrl,
        })
      } else {
        pushCandidate(
          found,
          makeVideo({
            provider: 'embed',
            playUrl: abs,
            watchUrl: pageUrl,
            embedUrl: abs,
            thumbnailUrl: pageImage,
            title: pageTitle,
            source: 'page',
            pageUrl,
            downloadable: false,
          })
        )
      }
    }
  }

  // JSON-LD VideoObject / NewsArticle.video
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html()
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as unknown
      const nodes = Array.isArray(parsed) ? parsed : [parsed]
      for (const node of nodes) {
        collectJsonLdVideos(node, pageUrl, pageTitle, pageImage, found)
      }
    } catch {
      /* skip invalid json-ld */
    }
  })

  // iframe embeds
  $('iframe[src], iframe[data-src]').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src')
    if (!src) return
    const abs = absUrl(src, pageUrl)
    if (!abs) return
    const direct = resolveDirectVideoUrl(abs)
    if (direct) {
      pushCandidate(found, {
        ...direct,
        title: direct.title || pageTitle,
        thumbnailUrl: direct.thumbnailUrl || pageImage,
        source: 'page',
        pageUrl,
      })
      return
    }
    if (/embed|player|video/i.test(abs)) {
      pushCandidate(
        found,
        makeVideo({
          provider: 'embed',
          playUrl: abs,
          watchUrl: pageUrl,
          embedUrl: abs,
          thumbnailUrl: pageImage,
          title: pageTitle,
          source: 'page',
          pageUrl,
          downloadable: false,
        })
      )
    }
  })

  // <video> / <source>
  $('video[src], video source[src]').each((_, el) => {
    const src = $(el).attr('src')
    if (!src) return
    const abs = absUrl(src, pageUrl)
    if (!abs) return
    const poster = $(el).closest('video').attr('poster')
    const thumb = poster ? absUrl(poster, pageUrl) : pageImage
    const direct = resolveDirectVideoUrl(abs)
    if (direct) {
      pushCandidate(found, {
        ...direct,
        title: direct.title || pageTitle,
        thumbnailUrl: direct.thumbnailUrl || thumb,
        source: 'page',
        pageUrl,
      })
    } else {
      pushCandidate(
        found,
        makeVideo({
          provider: /\.m3u8/i.test(abs) ? 'hls' : 'mp4',
          playUrl: abs,
          watchUrl: abs,
          embedUrl: null,
          thumbnailUrl: thumb,
          title: pageTitle,
          source: 'page',
          pageUrl,
        })
      )
    }
  })

  // amp-youtube
  $('amp-youtube[data-videoid]').each((_, el) => {
    const id = $(el).attr('data-videoid')?.trim()
    if (!id || id.length !== 11) return
    pushCandidate(
      found,
      makeVideo({
        provider: 'youtube',
        playUrl: youtubeEmbed(id),
        watchUrl: youtubeWatch(id),
        embedUrl: youtubeEmbed(id),
        thumbnailUrl: youtubeThumb(id),
        title: pageTitle,
        source: 'page',
        pageUrl,
        downloadable: false,
      })
    )
  })

  // Raw YouTube patterns in HTML (scripts, data attributes)
  const ytIds = new Set<string>()
  const ytRe =
    /(?:youtube(?:-nocookie)?\.com\/(?:embed|shorts|watch\?v=|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g
  let m: RegExpExecArray | null
  while ((m = ytRe.exec(html)) !== null) {
    ytIds.add(m[1])
    if (ytIds.size >= 5) break
  }
  for (const id of ytIds) {
    pushCandidate(
      found,
      makeVideo({
        provider: 'youtube',
        playUrl: youtubeEmbed(id),
        watchUrl: youtubeWatch(id),
        embedUrl: youtubeEmbed(id),
        thumbnailUrl: youtubeThumb(id),
        title: pageTitle,
        source: 'page',
        pageUrl,
        downloadable: false,
      })
    )
  }

  // Vimeo / Dailymotion loose patterns
  for (const match of html.matchAll(/player\.vimeo\.com\/video\/(\d{6,})/g)) {
    const id = match[1]
    const embed = `https://player.vimeo.com/video/${id}`
    pushCandidate(
      found,
      makeVideo({
        provider: 'vimeo',
        playUrl: embed,
        watchUrl: `https://vimeo.com/${id}`,
        embedUrl: embed,
        thumbnailUrl: pageImage,
        title: pageTitle,
        source: 'page',
        pageUrl,
        downloadable: false,
      })
    )
  }

  found.sort((a, b) => scoreProvider(b.provider) - scoreProvider(a.provider))
  return found
}

function collectJsonLdVideos(
  node: unknown,
  pageUrl: string,
  pageTitle: string | null,
  pageImage: string | null,
  found: ScrapedVideo[]
) {
  if (!node || typeof node !== 'object') return
  const obj = node as Record<string, unknown>

  if (Array.isArray(obj['@graph'])) {
    for (const child of obj['@graph']) {
      collectJsonLdVideos(child, pageUrl, pageTitle, pageImage, found)
    }
  }

  const type = obj['@type']
  const types = Array.isArray(type) ? type.map(String) : type ? [String(type)] : []

  if (types.some((t) => /VideoObject/i.test(t))) {
    const contentUrl = typeof obj.contentUrl === 'string' ? obj.contentUrl : null
    const embedUrl = typeof obj.embedUrl === 'string' ? obj.embedUrl : null
    const name = typeof obj.name === 'string' ? obj.name : pageTitle
    const thumb =
      typeof obj.thumbnailUrl === 'string'
        ? obj.thumbnailUrl
        : Array.isArray(obj.thumbnailUrl)
          ? String(obj.thumbnailUrl[0] ?? '')
          : pageImage

    for (const candidate of [embedUrl, contentUrl]) {
      if (!candidate) continue
      const abs = absUrl(candidate, pageUrl)
      if (!abs) continue
      const direct = resolveDirectVideoUrl(abs)
      if (direct) {
        pushCandidate(found, {
          ...direct,
          title: direct.title || name,
          thumbnailUrl: direct.thumbnailUrl || thumb || null,
          source: 'page',
          pageUrl,
        })
      } else {
        pushCandidate(
          found,
          makeVideo({
            provider: /\.(mp4|webm)(\?|$)/i.test(abs) ? 'mp4' : 'embed',
            playUrl: abs,
            watchUrl: abs,
            embedUrl: embedUrl ? absUrl(embedUrl, pageUrl) : null,
            thumbnailUrl: thumb || null,
            title: name,
            source: 'page',
            pageUrl,
          })
        )
      }
    }
  }

  // NewsArticle / Article with nested video
  if (obj.video) {
    const videos = Array.isArray(obj.video) ? obj.video : [obj.video]
    for (const v of videos) {
      if (typeof v === 'string') {
        const abs = absUrl(v, pageUrl)
        if (abs) {
          const direct = resolveDirectVideoUrl(abs)
          if (direct) {
            pushCandidate(found, {
              ...direct,
              title: direct.title || pageTitle,
              thumbnailUrl: direct.thumbnailUrl || pageImage,
              source: 'page',
              pageUrl,
            })
          }
        }
      } else {
        collectJsonLdVideos(v, pageUrl, pageTitle, pageImage, found)
      }
    }
  }
}

async function enrichYouTubeOEmbed(video: ScrapedVideo): Promise<ScrapedVideo> {
  if (video.provider !== 'youtube') return video
  const id = parseYouTubeVideoId(video.watchUrl) || parseYouTubeVideoId(video.playUrl)
  if (!id) return video
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeWatch(id))}&format=json`
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(6_000) })
    if (!res.ok) return video
    const data = (await res.json()) as { title?: string; thumbnail_url?: string }
    return {
      ...video,
      title: data.title?.trim() || video.title,
      thumbnailUrl: data.thumbnail_url?.trim() || video.thumbnailUrl || youtubeThumb(id),
      source: video.source === 'direct' ? 'oembed' : video.source,
    }
  } catch {
    return {
      ...video,
      thumbnailUrl: video.thumbnailUrl || youtubeThumb(id),
    }
  }
}

/**
 * Ana giriş: URL'den video scrap/resolve.
 */
export async function scrapeVideoFromUrl(
  rawUrl: string
): Promise<ScrapeVideoResult | ScrapeVideoError> {
  const url = rawUrl.trim()
  if (!url) return { ok: false, error: 'URL gerekli' }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, error: 'Geçersiz URL' }
  }

  // 1) Doğrudan platform / dosya
  const direct = resolveDirectVideoUrl(parsed.href)
  if (direct) {
    const enriched = await enrichYouTubeOEmbed(direct)
    return { ok: true, video: enriched, alternatives: [] }
  }

  // 2) Content-Type video mi?
  const ct = await probeContentType(parsed.href)
  if (ct?.startsWith('video/')) {
    const video = makeVideo({
      provider: 'mp4',
      playUrl: parsed.href,
      watchUrl: parsed.href,
      embedUrl: null,
      thumbnailUrl: null,
      title: null,
      source: 'direct',
      downloadable: true,
    })
    return { ok: true, video, alternatives: [] }
  }

  // 3) HTML sayfasından scrape
  const html = await fetchHtml(parsed.href)
  if (!html) {
    return {
      ok: false,
      error:
        'Sayfa veya video alınamadı. Doğrudan YouTube / MP4 linki veya video içeren bir haber URL’si deneyin.',
    }
  }

  const candidates = extractFromHtml(html, parsed.href)
  if (candidates.length === 0) {
    return {
      ok: false,
      error: 'Bu sayfada oynatılabilir video bulunamadı (YouTube, Vimeo, MP4 veya embed).',
    }
  }

  const [best, ...rest] = candidates
  const enriched = await enrichYouTubeOEmbed(best)
  return { ok: true, video: enriched, alternatives: rest.slice(0, 4) }
}

/** iframe ile oynatılmalı mı — client için `@/lib/videoEmbed` kullan. */
export { isEmbedPlayerUrl } from '@/lib/videoEmbed'
