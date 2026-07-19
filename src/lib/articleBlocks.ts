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
const HEADING_MAX_WORDS = 8
const HEADING_MAX_CHARS = 90

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

/**
 * Keep headings short. If AI glued a title and paragraph onto one markdown line,
 * peel a short title and return the remainder as paragraph text.
 */
export function splitOversizedHeading(text: string): {
  heading: string
  overflow: string
} {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return { heading: '', overflow: '' }

  const words = normalized.split(' ')
  if (words.length <= HEADING_MAX_WORDS && normalized.length <= HEADING_MAX_CHARS) {
    return { heading: normalized, overflow: '' }
  }

  const short = words.slice(0, Math.min(4, words.length)).join(' ')
  const overflow = words.slice(Math.min(4, words.length)).join(' ').trim()
  if (short.length < 3) {
    return { heading: '', overflow: normalized }
  }
  return { heading: short.slice(0, HEADING_MAX_CHARS), overflow }
}

export function sanitizeArticleBlocks(value: unknown): ArticleBlock[] {
  if (!Array.isArray(value)) return []

  return value.slice(0, MAX_BLOCKS).flatMap((raw, index): ArticleBlock[] => {
    if (!raw || typeof raw !== 'object') return []
    const block = raw as Record<string, unknown>
    const id = cleanId(block.id, index)

    if (block.type === 'heading') {
      const text = cleanText(block.text, 500).replace(/\s+/g, ' ')
      if (!text) return []
      // Page title owns the only H1 — coerce body H1 → H2 for SEO/accessibility.
      const rawLevel = block.level === 1 || block.level === 3 || block.level === 4 ? block.level : 2
      const level = rawLevel === 1 ? 2 : rawLevel
      const { heading, overflow } = splitOversizedHeading(text)
      const out: ArticleBlock[] = []
      if (heading) out.push({ id, type: 'heading', level, text: heading })
      if (overflow) {
        out.push({
          id: `${id}-p`,
          type: 'paragraph',
          text: overflow.slice(0, MAX_TEXT),
        })
      }
      return out
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

function parseMarkdownHeadingLine(
  line: string
): { level: 1 | 2 | 3 | 4; text: string } | null {
  const match = line.match(/^(#{1,4})\s+(.+)$/)
  if (!match) return null
  const level = Math.min(4, match[1].length) as 1 | 2 | 3 | 4
  return { level, text: match[2].trim() }
}

/** Convert lightweight Markdown/plain text into editable blocks in the CMS. */
export function textToArticleBlocks(text: string): ArticleBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ArticleBlock[] = []
  let paragraphLines: string[] = []
  let listItems: string[] | null = null
  let listStyle: 'unordered' | 'ordered' | null = null
  let index = 0

  const flushParagraph = () => {
    const textValue = paragraphLines.join(' ').replace(/\s+/g, ' ').trim()
    paragraphLines = []
    if (!textValue) return
    blocks.push({
      id: `block-${Date.now()}-${index++}`,
      type: 'paragraph',
      text: textValue,
    })
  }

  const flushList = () => {
    if (!listItems || listItems.length === 0 || !listStyle) {
      listItems = null
      listStyle = null
      return
    }
    blocks.push({
      id: `block-${Date.now()}-${index++}`,
      type: 'list',
      style: listStyle,
      items: listItems,
    })
    listItems = null
    listStyle = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushList()
      flushParagraph()
      continue
    }

    const heading = parseMarkdownHeadingLine(line)
    if (heading) {
      flushList()
      flushParagraph()
      const { heading: title, overflow } = splitOversizedHeading(heading.text)
      const level = (heading.level === 1 ? 2 : heading.level) as 2 | 3 | 4
      if (title) {
        blocks.push({
          id: `block-${Date.now()}-${index++}`,
          type: 'heading',
          level,
          text: title,
        })
      }
      if (overflow) {
        blocks.push({
          id: `block-${Date.now()}-${index++}`,
          type: 'paragraph',
          text: overflow,
        })
      }
      continue
    }

    const unordered = line.match(/^[-*]\s+(.+)$/)
    if (unordered) {
      flushParagraph()
      if (listStyle !== 'unordered') {
        flushList()
        listStyle = 'unordered'
        listItems = []
      }
      listItems!.push(unordered[1].trim())
      continue
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/)
    if (ordered) {
      flushParagraph()
      if (listStyle !== 'ordered') {
        flushList()
        listStyle = 'ordered'
        listItems = []
      }
      listItems!.push(ordered[1].trim())
      continue
    }

    flushList()
    paragraphLines.push(line)
  }

  flushList()
  flushParagraph()
  return blocks
}
