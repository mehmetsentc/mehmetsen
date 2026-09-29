import * as cheerio from 'cheerio'
import type { AnalysisItem, AssetAvailability, AssetChoice } from '@/media-studio/types'
import { safeFetch, StudioHttpError } from './http'

export interface PlanAsset {
  key: AssetChoice
  label: string
  url?: string
  text?: string
  filename: string
}

export interface DownloadPlan {
  url: string
  title: string
  source: string
  thumbHue: number
  assets: PlanAsset[]
}

export interface InspectedPage {
  item: AnalysisItem
  plan: DownloadPlan
}

const CHOICE_LABEL: Record<AssetChoice, string> = {
  video: 'Video',
  description: 'Açıklama',
  images: 'Görseller',
  thumbnail: 'Kapak',
  metadata: 'Metadata',
  subtitle: 'Altyazı',
  audio: 'Ses',
}

export async function inspectUrl(rawUrl: string): Promise<InspectedPage> {
  let fetched: Awaited<ReturnType<typeof safeFetch>>
  try {
    fetched = await safeFetch(rawUrl, { maxBytes: 1_500_000, timeoutMs: 15_000, truncate: true })
  } catch (error) {
    const message = error instanceof StudioHttpError ? error.message : 'Bağlantı incelenmedi.'
    return failedInspect(rawUrl, message)
  }
  const type = fetched.contentType.toLowerCase()
  if (type.startsWith('image/')) return directFile(fetched.finalUrl, 'images', type)
  if (type.startsWith('video/')) return directFile(fetched.finalUrl, 'video', type)
  const html = fetched.body.toString('utf8')
  return inspectHtml(fetched.finalUrl, html)
}

export function inspectHtml(pageUrl: string, html: string): InspectedPage {
  const $ = cheerio.load(html)
  const page = new URL(pageUrl)
  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').first().text().trim() ||
    page.hostname
  const description =
    $('meta[property="og:description"]').attr('content')?.trim() ||
    $('meta[name="description"]').attr('content')?.trim() ||
    ''
  const images = uniqueUrls(
    [
      $('meta[property="og:image"]').attr('content'),
      ...$('img[src]')
        .toArray()
        .slice(0, 24)
        .map((node) => $(node).attr('src')),
    ]
      .map((value) => absolutize(value, pageUrl))
      .filter((value): value is string => Boolean(value))
  ).slice(0, 8)
  const videos = uniqueUrls(
    [
      $('meta[property="og:video"]').attr('content'),
      $('meta[property="og:video:url"]').attr('content'),
      ...$('video[src], video source[src]')
        .toArray()
        .map((node) => $(node).attr('src')),
    ]
      .map((value) => absolutize(value, pageUrl))
      .filter((value): value is string => Boolean(value && looksLikeFile(value, ['mp4', 'webm', 'mov', 'm4v'])))
  )
  const cover = absolutize($('meta[property="og:image"]').attr('content'), pageUrl) || images[0] || null
  const duration = $('meta[property="video:duration"]').attr('content')?.trim() || null
  const assets: PlanAsset[] = []
  if (videos[0]) {
    assets.push({ key: 'video', label: 'Video', url: videos[0], filename: fileName(videos[0], 'video.mp4') })
  }
  images.forEach((image, index) => {
    assets.push({
      key: 'images',
      label: 'Görseller',
      url: image,
      filename: `${String(index + 1).padStart(2, '0')}.${extOf(image, 'jpg')}`,
    })
  })
  if (description) {
    assets.push({ key: 'description', label: 'Açıklama', text: description, filename: 'description.txt' })
  }
  if (cover) {
    assets.push({ key: 'thumbnail', label: 'Kapak', url: cover, filename: `cover.${extOf(cover, 'jpg')}` })
  }
  assets.push({
    key: 'metadata',
    label: 'Metadata',
    text: JSON.stringify({ title, source: page.hostname, url: pageUrl, description }, null, 2),
    filename: 'metadata.json',
  })
  return buildReady({
    url: pageUrl,
    title,
    source: page.hostname.replace(/^www\./, ''),
    duration,
    quality: videos[0] ? 'Doğrudan video' : null,
    summary: [
      videos[0] ? 'Video' : null,
      images.length ? `${images.length} Görsel` : null,
      description ? 'Açıklama' : null,
      cover ? 'Kapak' : null,
    ].filter((part): part is string => Boolean(part)),
    assets,
    thumbHue: hueFrom(page.hostname),
  })
}

function directFile(url: string, kind: 'video' | 'images', contentType: string): InspectedPage {
  const page = new URL(url)
  const name = fileName(url, kind === 'video' ? 'video.mp4' : 'image.jpg')
  const assets: PlanAsset[] = [
    { key: kind, label: CHOICE_LABEL[kind], url, filename: name },
    {
      key: 'metadata',
      label: 'Metadata',
      text: JSON.stringify({ url, contentType }, null, 2),
      filename: 'metadata.json',
    },
  ]
  return buildReady({
    url,
    title: decodeURIComponent(name),
    source: page.hostname.replace(/^www\./, ''),
    duration: null,
    quality: contentType,
    summary: [kind === 'video' ? 'Video' : 'Görsel'],
    assets,
    thumbHue: hueFrom(url),
  })
}

function buildReady(input: {
  url: string
  title: string
  source: string
  duration: string | null
  quality: string | null
  summary: string[]
  assets: PlanAsset[]
  thumbHue: number
}): InspectedPage {
  const keys = new Set(input.assets.map((asset) => asset.key))
  const availability: AssetAvailability[] = (Object.keys(CHOICE_LABEL) as AssetChoice[]).map((key) => ({
    key,
    label: CHOICE_LABEL[key],
    available: keys.has(key),
    detail: keys.has(key) ? undefined : 'Bu bağlantıda yok.',
  }))
  const id = `an_${hash(input.url).slice(0, 12)}`
  return {
    item: {
      id,
      url: input.url,
      status: 'READY',
      title: input.title.slice(0, 180),
      source: input.source,
      durationLabel: input.duration,
      qualityLabel: input.quality,
      summary: input.summary,
      assets: availability,
      thumbHue: input.thumbHue,
      mock: false,
    },
    plan: {
      url: input.url,
      title: input.title.slice(0, 180),
      source: input.source,
      thumbHue: input.thumbHue,
      assets: input.assets,
    },
  }
}

function failedInspect(url: string, message: string): InspectedPage {
  let source = url
  try {
    source = new URL(url).hostname
  } catch {
    source = 'bağlantı'
  }
  return {
    item: {
      id: `an_${hash(url).slice(0, 12)}`,
      url,
      status: 'FAILED',
      title: 'Bağlantı çözümlenemedi',
      source,
      durationLabel: null,
      qualityLabel: null,
      summary: [],
      assets: [],
      errorTitle: message,
      errorDetail: message,
      thumbHue: 0,
      mock: false,
    },
    plan: { url, title: 'Bağlantı çözümlenemedi', source, thumbHue: 0, assets: [] },
  }
}

function absolutize(value: string | undefined, base: string): string | null {
  if (!value) return null
  try {
    const url = new URL(value, base)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

function uniqueUrls(values: string[]): string[] {
  return [...new Set(values)]
}

function looksLikeFile(url: string, extensions: string[]): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase()
    return extensions.some((ext) => path.endsWith(`.${ext}`))
  } catch {
    return false
  }
}

function extOf(url: string, fallback: string): string {
  try {
    const match = new URL(url).pathname.match(/\.([a-z0-9]{2,4})$/i)
    return (match?.[1] ?? fallback).toLowerCase()
  } catch {
    return fallback
  }
}

function fileName(url: string, fallback: string): string {
  try {
    const base = decodeURIComponent(new URL(url).pathname.split('/').pop() || fallback)
    return base.replace(/[^\w.\-]+/g, '_').slice(0, 80) || fallback
  } catch {
    return fallback
  }
}

function hueFrom(value: string): number {
  let hash = 0
  for (const char of value) hash = (hash * 33 + char.charCodeAt(0)) % 360
  return hash
}

function hash(value: string): string {
  let h = 2166136261
  for (const char of value) {
    h ^= char.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}
