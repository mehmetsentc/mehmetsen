/**
 * Build CMS-compatible ArticleBlock[] from AI / newsroom plain text.
 * Page title owns the only H1 — body never emits heading level 1.
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
  /** Optional short heading placed under the lead image (H2). */
  imageSectionHeading?: string
}

function newId(prefix: string, index: number): string {
  return `${prefix}-${Date.now().toString(36)}-${index}`
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
 * Derive a short H2/H3 under an image from caption or article title.
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
  const blocks: ArticleBlock[] = []
  let i = 0

  const spot = input.spot?.trim() || input.summary?.trim() || ''
  if (spot) {
    blocks.push({ id: newId('spot', i++), type: 'paragraph', text: spot })
  }

  const coverUrl = input.imageUrl?.trim()
  if (coverUrl) {
    const caption = input.imageCaption?.trim() || headingFromImageContext(undefined, input.title, 'Haber görseli')
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

  const content = (input.content || '').trim()
  if (content) {
    if (looksLikeMarkdownHeadings(content)) {
      const fromMd = textToArticleBlocks(content).map((block) => {
        if (block.type === 'heading' && block.level === 1) {
          return { ...block, level: 2 as const }
        }
        return block
      })
      // Avoid duplicating spot if first paragraph matches
      for (const block of fromMd) {
        if (
          block.type === 'paragraph' &&
          spot &&
          block.text.slice(0, 80) === spot.slice(0, 80)
        ) {
          continue
        }
        blocks.push({ ...block, id: newId('md', i++) })
      }
    } else {
      const paragraphs = splitParagraphs(content)
      const sectionEvery = Math.max(2, Math.ceil(paragraphs.length / 4))
      let sectionIndex = 0
      paragraphs.forEach((paragraph, idx) => {
        if (spot && idx === 0 && paragraph.slice(0, 80) === spot.slice(0, 80)) {
          return
        }
        if (idx > 0 && idx % sectionEvery === 0) {
          sectionIndex += 1
          const words = paragraph.split(/\s+/).slice(0, 8).join(' ')
          blocks.push({
            id: newId('h2', i++),
            type: 'heading',
            level: 2,
            text: words.length > 12 ? `${words}…` : `Bölüm ${sectionIndex}`,
          })
        } else if (idx > 0 && idx % sectionEvery === Math.floor(sectionEvery / 2) && sectionIndex > 0) {
          const words = paragraph.split(/\s+/).slice(0, 6).join(' ')
          if (words.length > 15) {
            blocks.push({
              id: newId('h3', i++),
              type: 'heading',
              level: 3,
              text: words,
            })
          }
        }
        blocks.push({ id: newId('p', i++), type: 'paragraph', text: paragraph })
      })
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
      url,
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

  return sanitizeArticleBlocks(blocks)
}
