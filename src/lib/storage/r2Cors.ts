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

/** Allowlisted S3 <Code> values. Anything else is collapsed so Message/ARN never leak. */
const S3_CORS_ERROR_CODES = new Set([
  'AccessDenied',
  'AccessForbidden',
  'ExpiredToken',
  'InternalError',
  'InvalidArgument',
  'InvalidRequest',
  'MalformedXML',
  'NoSuchBucket',
  'NoSuchCORSConfiguration',
  'NotImplemented',
  'RequestTimeTooSkewed',
  'ServiceUnavailable',
  'SignatureDoesNotMatch',
])

const UNSAFE_DIAGNOSTIC_TOKEN = /secret|access[_-]?key|credential|authorization|aws4|r2_account/i

export type CorsErrorClass =
  | 'Permission'
  | 'Signature'
  | 'Schema'
  | 'NotFound'
  | 'Unavailable'
  | 'Unknown'

export type SafeCorsError = {
  code: string
  httpStatus: number
  errorClass: CorsErrorClass
  safeMessage: string
}

function extractS3Code(xml: string): string | null {
  const match = /<Code>([A-Za-z0-9]+)<\/Code>/i.exec(xml)
  if (!match) return null
  const code = match[1]
  if (!S3_CORS_ERROR_CODES.has(code)) return null
  if (UNSAFE_DIAGNOSTIC_TOKEN.test(code)) return null
  return code
}

function errorClassFor(status: number, code: string | null): CorsErrorClass {
  if (code === 'SignatureDoesNotMatch' || code === 'RequestTimeTooSkewed') return 'Signature'
  if (code === 'MalformedXML' || code === 'InvalidArgument' || code === 'InvalidRequest') return 'Schema'
  if (code === 'NoSuchBucket' || status === 404) return 'NotFound'
  if (code === 'NotImplemented' || status >= 500) return 'Unavailable'
  if (status === 401 || status === 403 || code === 'AccessDenied' || code === 'AccessForbidden' || code === 'ExpiredToken') {
    return 'Permission'
  }
  return 'Unknown'
}

function safeMessageFor(errorClass: CorsErrorClass): string {
  switch (errorClass) {
    case 'Permission':
      return 'Object-scope R2 token cannot manage bucket CORS. Admin Read and Write is required, or set CORS in the Cloudflare dashboard.'
    case 'Signature':
      return 'S3 signature mismatch on the bucket CORS call.'
    case 'Schema':
      return 'R2 rejected the CORS document.'
    case 'NotFound':
      return 'R2 bucket was not found.'
    case 'Unavailable':
      return 'R2 CORS API was unavailable.'
    default:
      return 'Bucket CORS call failed.'
  }
}

export function classifyCorsS3Error(httpStatus: number, xmlOrText: string | null): SafeCorsError {
  const code = xmlOrText ? extractS3Code(xmlOrText) : null
  const errorClass = errorClassFor(httpStatus, code)
  return {
    code: code ?? `HTTP_${httpStatus}`,
    httpStatus,
    errorClass,
    safeMessage: safeMessageFor(errorClass),
  }
}

export function classifyThrownCorsError(err: unknown): SafeCorsError {
  const message = err instanceof Error ? err.message : ''
  const statusMatch = /R2_CORS_(?:GET|PUT)_FAILED_(\d{3})$/.exec(message)
  if (statusMatch) {
    return classifyCorsS3Error(Number(statusMatch[1]), null)
  }
  return {
    code: 'HTTP_0',
    httpStatus: 0,
    errorClass: 'Unknown',
    safeMessage: 'Bucket CORS call failed.',
  }
}
