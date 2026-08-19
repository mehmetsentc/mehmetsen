import { extractFromHtml } from '@extractus/article-extractor'
import { htmlToPlainText } from './semantic'

export async function extractWithArticleExtractor(
  html: string,
  pageUrl: string
): Promise<{ text: string; html: string; title: string | null } | null> {
  try {
    const parsed = await extractFromHtml(html, pageUrl)
    const text = (parsed?.content ? htmlToPlainText(parsed.content) : parsed?.description || '').trim()
    if (text.length < 80) return null
    return {
      text,
      html: parsed?.content || `<p>${text}</p>`,
      title: parsed?.title?.trim() || null,
    }
  } catch {
    return null
  }
}
