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
  additionalImages?: Array<{ url: string; caption?: string; alt?: string }>
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

  const extras = input.additionalImages ?? []
  extras.forEach((image, idx) => {
    const url = image.url?.trim()
    if (!url || url === coverUrl) return
    const caption =
      image.caption?.trim() ||
      image.alt?.trim() ||
      headingFromImageContext(undefined, input.title, `Ek görsel ${idx + 1}`)
    blocks.push({
      id: newId('ximg', i++),
      type: 'image',
      url,
      alt: image.alt?.trim() || caption,
      caption,
    })
    blocks.push({
      id: newId('ximg-h', i++),
      type: 'heading',
      level: 3,
      text: headingFromImageContext(caption, input.title, `Görsel ${idx + 2}`),
    })
  })

  return sanitizeArticleBlocks(blocks)
}
