/**
 * Build CMS-compatible ArticleBlock[] from AI / newsroom plain text.
 * Category-agnostic: same H2/H3 + image caption rules for every category
 * and subcategory (gundem, spor/futbol, kultur/sinema, gezi, yerel-haber, …).
 * Page title owns the only H1 — body never emits heading level 1.
 * Spot and cover hero live outside bodyBlocks (title, spot field, thumbnail/mediaItems).
 */
import {
  sanitizeArticleBlocks,
  textToArticleBlocks,
  type ArticleBlock,
} from '@/lib/articleBlocks'

export interface BodyBlocksFromAiInput {
  title: string
  spot?: string
  summary?: string
  content: string
  imageUrl?: string
  imageCaption?: string
  additionalImages?: Array<{
    url: string
    caption?: string
    alt?: string
    credit?: string
    insertAfterParagraph?: number
  }>
  /** Optional short heading placed under the lead image (H2). Ignored when externalLeadAndCover is true. */
  imageSectionHeading?: string
  /**
   * When true (default), spot and cover image are NOT duplicated inside bodyBlocks —
   * they render via post.spot and hero media on the public page / CMS preview.
   */
  externalLeadAndCover?: boolean
}

export interface BodyBlocksDisplayFilter {
  title?: string
  spot?: string
  summary?: string
  coverImageUrl?: string
}

function newId(prefix: string, index: number): string {
  return `${prefix}-${Date.now().toString(36)}-${index}`
}

function compareKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function textsSimilar(a: string, b: string): boolean {
  const ka = compareKey(a)
  const kb = compareKey(b)
  if (!ka || !kb) return false
  if (ka === kb) return true
  const prefixLen = Math.min(ka.length, kb.length, 100)
  if (prefixLen < 35) return false
  return ka.slice(0, prefixLen) === kb.slice(0, prefixLen)
}

function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 20)
}

function looksLikeMarkdownHeadings(text: string): boolean {
  return /^#{1,4}\s+\S/m.test(text)
}

/**
 * Normalize AI markdown so headings are never glued to the next sentence.
 * Handles both "### Title\\nParagraph" and "### TitleParagraph".
 */
export function normalizeAiMarkdown(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/([^#\n])(#{1,4}\s+\S)/g, '$1\n\n$2')
    .replace(/^(#{1,4}\s+.+?[a-zçğıöşü])([A-ZÇĞİÖŞÜ])/gm, '$1\n\n$2')
    .replace(/^(#{1,4}\s+[^\n]{1,90})\n(?!\n|#)/gm, '$1\n\n')
    .trim()
}

function stripDuplicateSectionsFromMarkdown(content: string, refs: string[]): string {
  const chunks = content.split(/\n{2,}/)
  const seenParagraphKeys = new Set<string>()
  const kept: string[] = []

  for (const chunk of chunks) {
    const trimmed = chunk.trim()
    if (!trimmed) continue

    if (/^#{1,4}\s/m.test(trimmed)) {
      const lines = trimmed.split('\n')
      const headingLine = lines[0]?.trim() ?? ''
      const bodyLines = lines.slice(1).join(' ').replace(/\s+/g, ' ').trim()
      const headingText = headingLine.replace(/^#{1,4}\s+/, '').trim()

      if (refs.some((ref) => textsSimilar(headingText, ref))) continue

      if (bodyLines) {
        const key = compareKey(bodyLines)
        if (refs.some((ref) => textsSimilar(bodyLines, ref))) {
          kept.push(headingLine)
          continue
        }
        if (seenParagraphKeys.has(key)) continue
        seenParagraphKeys.add(key)
      }

      kept.push(trimmed)
      continue
    }

    const plain = trimmed.replace(/^#{1,4}\s+/m, '').replace(/\n/g, ' ').trim()
    const key = compareKey(plain)
    if (refs.some((ref) => textsSimilar(plain, ref))) continue
    if (seenParagraphKeys.has(key)) continue
    seenParagraphKeys.add(key)
    kept.push(trimmed)
  }

  return kept.join('\n\n')
}

/**
 * Remove spot/cover duplicates for article preview and public body rendering.
 */
export function filterBodyBlocksForArticleDisplay(
  blocks: ArticleBlock[],
  filter: BodyBlocksDisplayFilter
): ArticleBlock[] {
  const refs = [filter.title, filter.spot, filter.summary].filter(Boolean) as string[]
  const cover = filter.coverImageUrl?.trim()
  const out: ArticleBlock[] = []
  let skippedCoverImage = false

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]

    if (block.type === 'paragraph') {
      if (refs.some((ref) => textsSimilar(block.text, ref))) continue
      const prev = out[out.length - 1]
      if (prev?.type === 'paragraph' && textsSimilar(prev.text, block.text)) continue
      out.push(block)
      continue
    }

    if (block.type === 'image' && cover && !skippedCoverImage) {
      if (block.url.trim() === cover) {
        skippedCoverImage = true
        const next = blocks[i + 1]
        if (next?.type === 'heading' && refs.some((ref) => textsSimilar(next.text, ref))) {
          i += 1
        }
        continue
      }
    }

    if (block.type === 'heading') {
      if (refs.some((ref) => textsSimilar(block.text, ref))) continue
    }

    out.push(block)
  }

  return out
}

function dedupeBlocks(blocks: ArticleBlock[], refs: string[]): ArticleBlock[] {
  const out: ArticleBlock[] = []
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      if (refs.some((ref) => textsSimilar(block.text, ref))) continue
      const prev = out[out.length - 1]
      if (prev?.type === 'paragraph' && textsSimilar(prev.text, block.text)) continue
    }
    if (block.type === 'heading' && refs.some((ref) => textsSimilar(block.text, ref))) {
      continue
    }
    out.push(block)
  }
  return out
}

/**
 * Derive a short H2/H3 under an in-body image from caption or article title.
 */
function headingFromImageContext(
  caption: string | undefined,
  title: string,
  fallback: string
): string {
  const raw = (caption || title || fallback).trim()
  if (!raw) return fallback
  const cleaned = raw
    .replace(/^(fotoğraf|görsel|image)\s*[:\-–—]?\s*/i, '')
    .slice(0, 90)
    .trim()
  return cleaned || fallback
}

/**
 * Convert AI rewrite output into rich body blocks for AdminNewsEditor / public renderer.
 */
export function buildBodyBlocksFromAi(input: BodyBlocksFromAiInput): ArticleBlock[] {
  const externalLeadAndCover = input.externalLeadAndCover !== false
  const blocks: ArticleBlock[] = []
  let i = 0

  const spot = input.spot?.trim() || input.summary?.trim() || ''
  const title = input.title?.trim() || ''
  const dedupeRefs = [title, spot, input.summary?.trim()].filter(Boolean) as string[]

  if (spot && !externalLeadAndCover) {
    blocks.push({ id: newId('spot', i++), type: 'paragraph', text: spot })
  }

  const coverUrl = input.imageUrl?.trim()
  if (coverUrl && !externalLeadAndCover) {
    const caption =
      input.imageCaption?.trim() ||
      headingFromImageContext(undefined, input.title, 'Haber görseli')
    blocks.push({
      id: newId('img', i++),
      type: 'image',
      url: coverUrl,
      alt: caption,
      caption,
    })
    const underHeading =
      input.imageSectionHeading?.trim() ||
      headingFromImageContext(input.imageCaption, input.title, 'Görselden')
    blocks.push({
      id: newId('img-h', i++),
      type: 'heading',
      level: 2,
      text: underHeading,
    })
  }

  let content = normalizeAiMarkdown((input.content || '').trim())
  if (content) {
    content = stripDuplicateSectionsFromMarkdown(content, dedupeRefs)
  }

  if (content) {
    if (looksLikeMarkdownHeadings(content)) {
      const fromMd = textToArticleBlocks(content).map((block) => {
        if (block.type === 'heading' && block.level === 1) {
          return { ...block, level: 2 as const }
        }
        return block
      })
      for (const block of fromMd) {
        blocks.push({ ...block, id: newId('md', i++) })
      }
    } else {
      for (const paragraph of splitParagraphs(content)) {
        blocks.push({ id: newId('p', i++), type: 'paragraph', text: paragraph })
      }
    }
  }

  const extras = (input.additionalImages ?? []).filter(
    (image) => image.url?.trim() && image.url.trim() !== coverUrl
  )
  const paragraphIndexes = blocks.flatMap((block, index) =>
    block.type === 'paragraph' ? [index] : []
  )
  const insertions = extras.map((image, idx) => {
    const url = image.url?.trim()
    const caption =
      image.caption?.trim() ||
      image.alt?.trim() ||
      headingFromImageContext(undefined, input.title, `Ek görsel ${idx + 1}`)
    const requested = image.insertAfterParagraph
    const paragraphNumber =
      typeof requested === 'number' && Number.isFinite(requested)
        ? Math.max(1, Math.min(paragraphIndexes.length, Math.round(requested)))
        : Math.max(1, Math.floor(((idx + 1) * paragraphIndexes.length) / (extras.length + 1)))
    const insertAt =
      paragraphIndexes.length > 0
        ? paragraphIndexes[paragraphNumber - 1] + 1
        : blocks.length
    const imageBlock: ArticleBlock = {
      id: newId('ximg', i++),
      type: 'image',
      url: url!,
      alt: image.alt?.trim() || caption,
      caption,
      ...(image.credit?.trim() ? { credit: image.credit.trim() } : {}),
    }
    const headingBlock: ArticleBlock = {
      id: newId('ximg-h', i++),
      type: 'heading',
      level: 3,
      text: headingFromImageContext(caption, input.title, `Görsel ${idx + 2}`),
    }
    return { insertAt, blocks: [imageBlock, headingBlock] }
  })
  insertions
    .sort((a, b) => b.insertAt - a.insertAt)
    .forEach((entry) => blocks.splice(entry.insertAt, 0, ...entry.blocks))

  const cleaned = dedupeBlocks(blocks, dedupeRefs)
  return sanitizeArticleBlocks(cleaned)
}
