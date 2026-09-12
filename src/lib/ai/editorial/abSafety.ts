import { countPlainWords } from '@/lib/contentQuality'
import { validateEditorialCandidate } from '@/services/editorial/editorialQualityGate'

const NUMBER_RE = /(?:\d+[.,]?\d*%|\d{1,3}(?:[.\s]\d{3})+|\d+[.,]\d+|\d+)/g
const QUOTE_RE = /[“"']([^”"']{3,180})[”"']/g

export function extractNumbers(text: string): string[] {
  return Array.from(text.matchAll(NUMBER_RE), (m) => m[0]).sort()
}

export function extractQuotes(text: string): string[] {
  return Array.from(text.matchAll(QUOTE_RE), (m) => m[1]!.trim()).sort()
}

export function certaintyMarkers(text: string): { claim: number; happened: number } {
  const lower = text.toLocaleLowerCase('tr-TR')
  return {
    claim: (lower.match(/iddia edildi|öne sürüldü|söyleniyor|iddia(ya)? göre/g) || []).length,
    happened: (lower.match(/\boldu\b|\bgerçekleşti\b|\bkesinleşti\b/g) || []).length,
  }
}

export function articleMetrics(article: { title: string; spot: string; content: string }) {
  const paras = article.content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith('#'))
  const words = paras.map((p) => countPlainWords(p))
  const avg = words.length ? words.reduce((a, b) => a + b, 0) / words.length : 0
  return {
    titleChars: article.title.trim().length,
    spotChars: article.spot.trim().length,
    bodyWords: countPlainWords(article.content),
    paragraphCount: paras.length,
    averageParagraphWords: Math.round(avg * 10) / 10,
    subheadingCount: (article.content.match(/^##\s+/gm) || []).length,
  }
}

export function safetyCompare(opts: {
  source: string
  generated: { title: string; spot: string; content: string }
}) {
  const combined = `${opts.generated.title}\n${opts.generated.spot}\n${opts.generated.content}`
  const sourceNumbers = new Set(extractNumbers(opts.source))
  const genNumbers = extractNumbers(combined)
  const unsupportedNumbers = genNumbers.filter((n) => !sourceNumbers.has(n))
  const gate = validateEditorialCandidate({
    title: opts.generated.title,
    body: `${opts.generated.spot}\n${opts.generated.content}`,
  })
  return {
    metrics: articleMetrics(opts.generated),
    certainty: certaintyMarkers(combined),
    unsupportedNumbers,
    quotes: extractQuotes(combined),
    gateIssues: gate.issues,
    gatePassed: gate.passed,
  }
}
