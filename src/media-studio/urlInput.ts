export interface ImportLine {
  raw: string
  url: string | null
  valid: boolean
  duplicate: boolean
}

export interface ImportDraft {
  lines: ImportLine[]
  urlCount: number
  duplicateCount: number
  invalidCount: number
  uniqueUrls: string[]
}

function normalizeUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (!parsed.hostname || !parsed.hostname.includes('.')) return null
  parsed.hash = ''
  const path = parsed.pathname.replace(/\/+$/, '') || '/'
  return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`
}

export function parseImportText(text: string): ImportDraft {
  const rawLines = text.split(/\r?\n/)
  const seen = new Set<string>()
  const lines: ImportLine[] = []
  let urlCount = 0
  let duplicateCount = 0
  let invalidCount = 0
  const uniqueUrls: string[] = []

  for (const raw of rawLines) {
    if (!raw.trim()) continue
    const url = normalizeUrl(raw)
    if (!url) {
      invalidCount += 1
      lines.push({ raw, url: null, valid: false, duplicate: false })
      continue
    }
    urlCount += 1
    if (seen.has(url)) {
      duplicateCount += 1
      lines.push({ raw, url, valid: true, duplicate: true })
      continue
    }
    seen.add(url)
    uniqueUrls.push(url)
    lines.push({ raw, url, valid: true, duplicate: false })
  }

  return { lines, urlCount, duplicateCount, invalidCount, uniqueUrls }
}
