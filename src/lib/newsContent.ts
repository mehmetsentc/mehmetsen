import { cleanupNewsBody } from '@/lib/newsContentCleanup'

const SOURCE_LINE_RE = /^kaynak:\s*.+$/i

/** Remove trailing "Kaynak: …" attribution lines from AI-generated body text. */
export function stripSourceAttribution(text: string): string {
  return text
    .split(/\n/)
    .filter((line) => !SOURCE_LINE_RE.test(line.trim()))
    .join('\n')
    .trim()
}

function splitOnSentences(text: string): string[] {
  const sentences = text
    .match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)
    ?.map((s) => s.trim())
    .filter(Boolean)

  return sentences && sentences.length > 1 ? sentences : [text]
}

/**
 * Split news body into display paragraphs.
 * Prefers double newlines, then single newlines, then sentence boundaries for long blocks.
 */
export function splitNewsParagraphs(content: string): string[] {
  const text = cleanupNewsBody(stripSourceAttribution(content), { preserveSourceLine: false })
  if (!text) return []

  if (/\n\s*\n/.test(text)) {
    return text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
  }

  if (text.includes('\n')) {
    const parts = text
      .split(/\n/)
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length > 1) return parts
  }

  if (text.length > 200) {
    return splitOnSentences(text)
  }

  return [text]
}
