export type ExtractionQualitySignals = {
  titleExists: boolean
  bodyExists: boolean
  wordCount: number
  charCount: number
  paragraphCount: number
  publishedAtExists: boolean
  canonicalExists: boolean
  mainImageExists: boolean
  bodyTitleRatio: number
  boilerplateRatio: number
}

export function articleTextStats(text: string): { wordCount: number; charCount: number; paragraphCount: number } {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  const charCount = text.trim().length
  const wordCount = trimmed ? trimmed.split(' ').filter(Boolean).length : 0
  const paragraphCount = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 40).length
  return { wordCount, charCount, paragraphCount: Math.max(paragraphCount, wordCount > 0 ? 1 : 0) }
}

export function computeExtractionConfidence(signals: ExtractionQualitySignals): number {
  let score = 0.08
  if (signals.titleExists) score += 0.14
  if (signals.bodyExists) score += 0.18
  if (signals.wordCount >= 80) score += 0.1
  if (signals.wordCount >= 220) score += 0.12
  if (signals.charCount >= 800) score += 0.08
  if (signals.paragraphCount >= 3) score += 0.1
  if (signals.publishedAtExists) score += 0.08
  if (signals.canonicalExists) score += 0.05
  if (signals.mainImageExists) score += 0.05
  if (signals.bodyTitleRatio >= 8) score += 0.06
  score -= Math.min(0.2, signals.boilerplateRatio * 0.25)
  return Math.max(0.05, Math.min(0.99, Number(score.toFixed(3))))
}

export function linkDensity(html: string, text: string): number {
  const bodyLen = text.replace(/\s+/g, ' ').trim().length
  if (!bodyLen) return 0
  const linkText = (html.match(/<a\b[^>]*>([\s\S]*?)<\/a>/gi) || [])
    .map((chunk) => chunk.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .join(' ').length
  return Number(Math.min(1, linkText / bodyLen).toFixed(3))
}

export function boilerplateRatio(body: string, title: string): number {
  const lower = body.toLowerCase()
  const markers = [
    'cookie',
    'subscribe',
    'newsletter',
    'related news',
    'read more',
    'advertisement',
    'reklam',
    'abone ol',
    'app store',
    'google play',
    'dijital evrensel uygulamamız',
  ]
  let hits = 0
  for (const marker of markers) if (lower.includes(marker)) hits += 1
  const titleRepeat = title && body.toLowerCase().includes(title.toLowerCase()) ? 0 : 0
  return Math.min(1, hits / markers.length + titleRepeat)
}
