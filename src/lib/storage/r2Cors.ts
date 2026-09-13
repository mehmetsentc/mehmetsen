/**
 * Additive nahaber-media CORS merge for browser playback.
 * Does not use Access-Control-Allow-Origin: * unless a rule already has it.
 */

export const NAHABER_PLAYBACK_ORIGIN = 'https://www.nahaber.com'

export const PLAYBACK_CORS_METHODS = ['GET', 'HEAD'] as const
export const PLAYBACK_CORS_HEADERS = ['Range'] as const
export const PLAYBACK_CORS_EXPOSE = [
  'Accept-Ranges',
  'Content-Range',
  'Content-Length',
  'Content-Type',
  'ETag',
] as const

export type PublicCorsRule = {
  origins: string[]
  methods: string[]
  headers: string[]
  exposeHeaders: string[]
  maxAgeSeconds: number | null
}

export function playbackCorsTemplate(): PublicCorsRule {
  return {
    origins: [NAHABER_PLAYBACK_ORIGIN],
    methods: [...PLAYBACK_CORS_METHODS],
    headers: [...PLAYBACK_CORS_HEADERS],
    exposeHeaders: [...PLAYBACK_CORS_EXPOSE],
    maxAgeSeconds: 3600,
  }
}

function uniqPreserve(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

function ruleHasOrigin(rule: PublicCorsRule, origin: string): boolean {
  return rule.origins.some((item) => item === origin)
}

function unionRule(base: PublicCorsRule, extra: PublicCorsRule): PublicCorsRule {
  return {
    origins: uniqPreserve([...base.origins, ...extra.origins]),
    methods: uniqPreserve([...base.methods, ...extra.methods]),
    headers: uniqPreserve([...base.headers, ...extra.headers]),
    exposeHeaders: uniqPreserve([...base.exposeHeaders, ...extra.exposeHeaders]),
    maxAgeSeconds: extra.maxAgeSeconds ?? base.maxAgeSeconds,
  }
}

function sameRule(a: PublicCorsRule, b: PublicCorsRule): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function mergePlaybackCors(existing: PublicCorsRule[]): {
  rules: PublicCorsRule[]
  changed: boolean
  wildcardPresent: boolean
} {
  const wildcardPresent = existing.some((rule) => rule.origins.includes('*'))
  const wanted = playbackCorsTemplate()
  const next = existing.map((rule) => ({
    origins: [...rule.origins],
    methods: [...rule.methods],
    headers: [...rule.headers],
    exposeHeaders: [...rule.exposeHeaders],
    maxAgeSeconds: rule.maxAgeSeconds,
  }))

  const matchIndex = next.findIndex((rule) => ruleHasOrigin(rule, NAHABER_PLAYBACK_ORIGIN))
  if (matchIndex >= 0) {
    next[matchIndex] = unionRule(next[matchIndex], wanted)
  } else {
    next.push(wanted)
  }

  return {
    rules: next,
    changed: next.length !== existing.length || next.some((rule, i) => !existing[i] || !sameRule(rule, existing[i])),
    wildcardPresent,
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function collectTags(block: string, tag: string): string[] {
  const out: string[] = []
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(block))) {
    const value = match[1].trim()
    if (value) out.push(value)
  }
  return out
}

export function parseCorsXml(xml: string | null): PublicCorsRule[] {
  if (!xml?.trim()) return []
  const rules: PublicCorsRule[] = []
  const ruleRe = /<CORSRule(?:\s[^>]*)?>([\s\S]*?)<\/CORSRule>/gi
  let match: RegExpExecArray | null
  while ((match = ruleRe.exec(xml))) {
    const block = match[1]
    const maxAgeRaw = collectTags(block, 'MaxAgeSeconds')[0]
    const maxAge = maxAgeRaw && Number.isFinite(Number(maxAgeRaw)) ? Number(maxAgeRaw) : null
    rules.push({
      origins: collectTags(block, 'AllowedOrigin'),
      methods: collectTags(block, 'AllowedMethod'),
      headers: collectTags(block, 'AllowedHeader'),
      exposeHeaders: collectTags(block, 'ExposeHeader'),
      maxAgeSeconds: maxAge,
    })
  }
  return rules
}

export function serializeCorsXml(rules: PublicCorsRule[]): string {
  const body = rules
    .map((rule) => {
      const origins = rule.origins.map((item) => `    <AllowedOrigin>${escapeXml(item)}</AllowedOrigin>`).join('\n')
      const methods = rule.methods.map((item) => `    <AllowedMethod>${escapeXml(item)}</AllowedMethod>`).join('\n')
      const headers = rule.headers.map((item) => `    <AllowedHeader>${escapeXml(item)}</AllowedHeader>`).join('\n')
      const expose = rule.exposeHeaders.map((item) => `    <ExposeHeader>${escapeXml(item)}</ExposeHeader>`).join('\n')
      const maxAge =
        rule.maxAgeSeconds !== null ? `    <MaxAgeSeconds>${escapeXml(String(rule.maxAgeSeconds))}</MaxAgeSeconds>` : ''
      return `  <CORSRule>\n${origins}\n${methods}\n${headers}\n${expose}${maxAge ? `\n${maxAge}` : ''}\n  </CORSRule>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">\n${body}\n</CORSConfiguration>\n`
}
