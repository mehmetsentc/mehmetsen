import type { MediaItem } from '@/types/post'

export type ArticleBlock =
  | { id: string; type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'list'; style: 'unordered' | 'ordered'; items: string[] }
  | { id: string; type: 'image'; url: string; alt?: string; caption?: string; credit?: string }
  | { id: string; type: 'video'; url: string; caption?: string }
  | {
      id: string
      type: 'gallery'
      columns: 2 | 3
      images: Array<{ url: string; alt?: string; caption?: string; credit?: string }>
    }
  | { id: string; type: 'divider' }

const MAX_BLOCKS = 200
const MAX_TEXT = 20_000
const MAX_IMAGES_PER_GALLERY = 9

function cleanText(value: unknown, max = MAX_TEXT): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function cleanUrl(value: unknown): string {
  const url = cleanText(value, 2_000)
  if (!url) return ''
  if (url.startsWith('/')) return url
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : ''
  } catch {
    return ''
  }
}

function cleanId(value: unknown, index: number): string {
  const id = cleanText(value, 80).replace(/[^a-zA-Z0-9_-]/g, '')
  return id || `block-${index + 1}`
}

export function sanitizeArticleBlocks(value: unknown): ArticleBlock[] {
  if (!Array.isArray(value)) return []

  return value.slice(0, MAX_BLOCKS).flatMap((raw, index): ArticleBlock[] => {
    if (!raw || typeof raw !== 'object') return []
    const block = raw as Record<string, unknown>
    const id = cleanId(block.id, index)

    if (block.type === 'heading') {
      const text = cleanText(block.text, 300)
      if (!text) return []
      const level = block.level === 1 || block.level === 3 || block.level === 4 ? block.level : 2
      return [{ id, type: 'heading', level, text }]
    }

    if (block.type === 'paragraph') {
      const text = cleanText(block.text)
      return text ? [{ id, type: 'paragraph', text }] : []
    }

    if (block.type === 'list') {
      const items = Array.isArray(block.items)
        ? block.items.map((item) => cleanText(item, 1_000)).filter(Boolean).slice(0, 50)
        : []
      if (items.length === 0) return []
      return [{
        id,
        type: 'list',
        style: block.style === 'ordered' ? 'ordered' : 'unordered',
        items,
      }]
    }

    if (block.type === 'image') {
      const url = cleanUrl(block.url)
      if (!url) return []
      return [{
        id,
        type: 'image',
        url,
        ...(cleanText(block.alt, 300) ? { alt: cleanText(block.alt, 300) } : {}),
        ...(cleanText(block.caption, 500) ? { caption: cleanText(block.caption, 500) } : {}),
        ...(cleanText(block.credit, 200) ? { credit: cleanText(block.credit, 200) } : {}),
      }]
    }

    if (block.type === 'video') {
      const url = cleanUrl(block.url)
      if (!url) return []
      return [{
        id,
        type: 'video',
        url,
        ...(cleanText(block.caption, 500) ? { caption: cleanText(block.caption, 500) } : {}),
      }]
    }

    if (block.type === 'gallery') {
      const images = Array.isArray(block.images)
        ? block.images.slice(0, MAX_IMAGES_PER_GALLERY).flatMap((image) => {
            if (!image || typeof image !== 'object') return []
            const item = image as Record<string, unknown>
            const url = cleanUrl(item.url)
            if (!url) return []
            return [{
              url,
              ...(cleanText(item.alt, 300) ? { alt: cleanText(item.alt, 300) } : {}),
              ...(cleanText(item.caption, 500) ? { caption: cleanText(item.caption, 500) } : {}),
              ...(cleanText(item.credit, 200) ? { credit: cleanText(item.credit, 200) } : {}),
            }]
          })
        : []
      if (images.length === 0) return []
      return [{
        id,
        type: 'gallery',
        columns: block.columns === 2 ? 2 : 3,
        images,
      }]
    }

    return block.type === 'divider' ? [{ id, type: 'divider' }] : []
  })
}

export function articleBlocksToPlainText(blocks: ArticleBlock[]): string {
  return blocks
    .flatMap((block) => {
      if (block.type === 'heading' || block.type === 'paragraph') return [block.text]
      if (block.type === 'video' && block.caption) return [block.caption]
      if (block.type === 'list') return block.items
      return []
    })
    .join('\n\n')
    .trim()
}

export function articleBlockImages(block: Extract<ArticleBlock, { type: 'gallery' }>): MediaItem[] {
  return block.images.map((image, index) => ({
    id: `${block.id}-${index}`,
    type: 'image',
    url: image.url,
    thumbnailUrl: null,
    caption: image.caption ?? null,
    alt: image.alt ?? null,
    credit: image.credit ?? null,
    order: index,
  }))
}

export function headingAnchor(text: string, fallback: string): string {
  const anchor = text
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return anchor || fallback
}

/** Convert lightweight Markdown/plain text into editable blocks in the CMS. */
export function textToArticleBlocks(text: string): ArticleBlock[] {
  const chunks = text.trim().split(/\n{2,}/).map((chunk) => chunk.trim()).filter(Boolean)
  return chunks.map((chunk, index): ArticleBlock => {
    const id = `block-${Date.now()}-${index + 1}`
    if (chunk.startsWith('#### ')) {
      return { id, type: 'heading', level: 4, text: chunk.slice(5).trim() }
    }
    if (chunk.startsWith('### ')) {
      return { id, type: 'heading', level: 3, text: chunk.slice(4).trim() }
    }
    if (chunk.startsWith('## ')) {
      return { id, type: 'heading', level: 2, text: chunk.slice(3).trim() }
    }
    if (chunk.startsWith('# ')) {
      return { id, type: 'heading', level: 1, text: chunk.slice(2).trim() }
    }
    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean)
    if (lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line))) {
      return {
        id,
        type: 'list',
        style: 'unordered',
        items: lines.map((line) => line.replace(/^[-*]\s+/, '')),
      }
    }
    if (lines.length > 0 && lines.every((line) => /^\d+[.)]\s+/.test(line))) {
      return {
        id,
        type: 'list',
        style: 'ordered',
        items: lines.map((line) => line.replace(/^\d+[.)]\s+/, '')),
      }
    }
    return { id, type: 'paragraph', text: chunk.replace(/\n+/g, ' ') }
  })
}
