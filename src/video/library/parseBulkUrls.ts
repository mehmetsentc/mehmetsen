export type ParsedBulkUrls = {
  unique: string[]
  duplicates: string[]
  blankSkipped: number
}

/**
 * Split pasted text into unique URLs. Blank lines are dropped.
 * Duplicate pasted lines (after trim) collapse to the first occurrence.
 * Does not fetch, download, or inspect.
 */
export function parseBulkVideoUrls(raw: string): ParsedBulkUrls {
  const unique: string[] = []
  const duplicates: string[] = []
  let blankSkipped = 0
  const seen = new Set<string>()

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) {
      blankSkipped += 1
      continue
    }
    const key = trimmed.toLowerCase()
    if (seen.has(key)) {
      duplicates.push(trimmed)
      continue
    }
    seen.add(key)
    unique.push(trimmed)
  }

  return { unique, duplicates, blankSkipped }
}
