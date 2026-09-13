/**
 * Production-runtime R2 self-test (V1C.1R4).
 *
 * Reuses R2StorageProvider. No Postgres, Firestore, news, or Video Library tables.
 * Never logs or returns secret values.
 */
import type { StorageProvider } from './types'
import { R2StorageProvider, isR2Configured } from '@/lib/storage'
import {
  ORIGINAL_MP4_BASE64,
  PLAYBACK_MP4_BASE64,
  POSTER_WEBP_BASE64,
  fixtureBytes,
} from './r2SelfTestFixtures'

export type CheckResult = 'PASS' | 'FAIL' | 'SKIP'

export const VALIDATION_PREFIX = 'video-library-validation/'
export const VALIDATION_OBJECT_NAMES = {
  original: 'original.mp4',
  poster: 'poster.webp',
  playback: 'playback-720p.mp4',
} as const

export type ValidationObjectName = (typeof VALIDATION_OBJECT_NAMES)[keyof typeof VALIDATION_OBJECT_NAMES]

const VALIDATION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PLAYBACK_SITE_ORIGIN = 'https://www.nahaber.com'
const FETCH_TIMEOUT_MS = 15_000
const START_RANGE = { start: 0, end: 1023 } as const

export type UploadedObjectReport = {
  key: string
  mime: string
  bytes: number
  exists: boolean
  pass: boolean
}

export type PublicHttpReport = {
  status: number | null
  contentType: string | null
  contentLength: string | null
  etag: string | null
  cacheControl: string | null
  acceptRanges: string | null
}

export type RangeProbe = {
  status: number | null
  contentRange: string | null
  bodyBytes: number | null
  expectedBytes: number
  accessControlAllowOrigin: string | null
}

export type R2SelfTestRunResult = {
  action: 'run'
  configured: boolean
  validationId: string | null
  upload: CheckResult
  publicGet: CheckResult
  rangeStart: CheckResult
  rangeMiddle: CheckResult
  faststart: CheckResult
  cors: CheckResult
  cleanupRequired: boolean
  objects: {
    original: UploadedObjectReport | null
    poster: UploadedObjectReport | null
    playback: UploadedObjectReport | null
  }
  publicHttp: PublicHttpReport | null
  range: { start: RangeProbe | null; middle: RangeProbe | null }
  faststartDetail: { moovOffset: number | null; mdatOffset: number | null; moovBeforeMdat: boolean } | null
  corsFinding: string | null
  playbackPublicUrl: string | null
  posterPublicUrl: string | null
}

export type R2SelfTestCleanupResult = {
  action: 'cleanup'
  configured: boolean
  validationId: string | null
  createdCount: number
  deletedCount: number
  remainingCount: number | null
  cleanup: CheckResult
}

export type R2SelfTestDeps = {
  storage?: StorageProvider
  fetchImpl?: typeof fetch
  nowId?: () => string
  configured?: boolean
}

export function assertSafeValidationId(raw: string): string {
  const id = raw.trim()
  if (!VALIDATION_ID_RE.test(id)) {
    throw new Error('INVALID_VALIDATION_ID')
  }
  return id.toLowerCase()
}

export function isAllowedValidationObjectName(name: string): name is ValidationObjectName {
  return (
    name === VALIDATION_OBJECT_NAMES.original ||
    name === VALIDATION_OBJECT_NAMES.poster ||
    name === VALIDATION_OBJECT_NAMES.playback
  )
}

export function validationObjectKey(validationId: string, filename: string): string {
  const id = assertSafeValidationId(validationId)
  if (!isAllowedValidationObjectName(filename)) {
    throw new Error('INVALID_OBJECT_NAME')
  }
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('INVALID_OBJECT_NAME')
  }
  return `${VALIDATION_PREFIX}${id}/${filename}`
}

export function allValidationKeys(validationId: string): string[] {
  return [
    validationObjectKey(validationId, VALIDATION_OBJECT_NAMES.original),
    validationObjectKey(validationId, VALIDATION_OBJECT_NAMES.poster),
    validationObjectKey(validationId, VALIDATION_OBJECT_NAMES.playback),
  ]
}

export function findMp4BoxOffsets(bytes: Uint8Array): {
  ftyp: number | null
  moov: number | null
  mdat: number | null
} {
  const found = { ftyp: null as number | null, moov: null as number | null, mdat: null as number | null }
  let offset = 0
  while (offset + 8 <= bytes.length) {
    const size =
      ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
    if (size < 8 || offset + size > bytes.length + 8) {
      if (size === 1) break
      break
    }
    if (type === 'ftyp' || type === 'moov' || type === 'mdat') {
      found[type] = offset
    }
    offset += size
  }
  return found
}

export function emptyRunResult(partial: Partial<R2SelfTestRunResult> = {}): R2SelfTestRunResult {
  return {
    action: 'run',
    configured: false,
    validationId: null,
    upload: 'SKIP',
    publicGet: 'SKIP',
    rangeStart: 'SKIP',
    rangeMiddle: 'SKIP',
    faststart: 'SKIP',
    cors: 'SKIP',
    cleanupRequired: false,
    objects: { original: null, poster: null, playback: null },
    publicHttp: null,
    range: { start: null, middle: null },
    faststartDetail: null,
    corsFinding: null,
    playbackPublicUrl: null,
    posterPublicUrl: null,
    ...partial,
  }
}

function header(res: Response, name: string): string | null {
  return res.headers.get(name)
}

function looksLikeSecret(value: string): boolean {
  return /secret|access[_-]?key|credential|authorization|aws4|r2_account/i.test(value)
}

export function assertSafeDiagnosticJson(payload: unknown): void {
  const serialized = JSON.stringify(payload)
  if (looksLikeSecret(serialized)) {
    throw new Error('UNSAFE_DIAGNOSTIC_PAYLOAD')
  }
}

async function timedFetch(fetchImpl: typeof fetch, url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetchImpl(url, { ...init, redirect: 'follow', signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

function resolveStorage(deps: R2SelfTestDeps): StorageProvider {
  return deps.storage ?? new R2StorageProvider()
}

async function uploadOne(
  storage: StorageProvider,
  key: string,
  body: Uint8Array,
  mime: string,
): Promise<UploadedObjectReport> {
  await storage.upload(key, body, {
    contentType: mime,
    cacheControl: 'public, max-age=120',
  })
  const exists = await storage.exists(key)
  return {
    key,
    mime,
    bytes: body.byteLength,
    exists,
    pass: exists,
  }
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function corsAllowsNahaber(originHeader: string | null): boolean {
  if (!originHeader) return false
  const trimmed = originHeader.trim()
  return trimmed === '*' || trimmed === PLAYBACK_SITE_ORIGIN
}

export async function runR2SelfTest(deps: R2SelfTestDeps = {}): Promise<R2SelfTestRunResult> {
  const configured = deps.configured ?? isR2Configured()
  if (!configured) {
    return emptyRunResult({ configured: false })
  }

  const fetchImpl = deps.fetchImpl ?? fetch
  const validationId = assertSafeValidationId(deps.nowId?.() ?? crypto.randomUUID())
  const storage = resolveStorage(deps)

  const originalBytes = fixtureBytes(ORIGINAL_MP4_BASE64)
  const posterBytes = fixtureBytes(POSTER_WEBP_BASE64)
  const playbackBytes = fixtureBytes(PLAYBACK_MP4_BASE64)

  const originalKey = validationObjectKey(validationId, VALIDATION_OBJECT_NAMES.original)
  const posterKey = validationObjectKey(validationId, VALIDATION_OBJECT_NAMES.poster)
  const playbackKey = validationObjectKey(validationId, VALIDATION_OBJECT_NAMES.playback)

  let original: UploadedObjectReport | null = null
  let poster: UploadedObjectReport | null = null
  let playback: UploadedObjectReport | null = null

  try {
    original = await uploadOne(storage, originalKey, originalBytes, 'video/mp4')
    poster = await uploadOne(storage, posterKey, posterBytes, 'image/webp')
    playback = await uploadOne(storage, playbackKey, playbackBytes, 'video/mp4')
  } catch {
    return emptyRunResult({
      configured: true,
      validationId,
      upload: 'FAIL',
      publicGet: 'FAIL',
      rangeStart: 'FAIL',
      rangeMiddle: 'FAIL',
      faststart: 'FAIL',
      cors: 'FAIL',
      cleanupRequired: true,
      objects: { original, poster, playback },
    })
  }

  const upload =
    original.pass && poster.pass && playback.pass ? 'PASS' : 'FAIL'

  const playbackPublicUrl = storage.getPublicUrl(playbackKey)
  const posterPublicUrl = storage.getPublicUrl(posterKey)

  if (!playbackPublicUrl.startsWith('https://')) {
    return emptyRunResult({
      configured: true,
      validationId,
      upload,
      publicGet: 'FAIL',
      rangeStart: 'FAIL',
      rangeMiddle: 'FAIL',
      faststart: 'FAIL',
      cors: 'FAIL',
      cleanupRequired: true,
      objects: { original, poster, playback },
      playbackPublicUrl,
      posterPublicUrl,
    })
  }

  let publicHttp: PublicHttpReport | null = null
  let publicGet: CheckResult = 'FAIL'
  let rangeStart: CheckResult = 'FAIL'
  let rangeMiddle: CheckResult = 'FAIL'
  let faststart: CheckResult = 'FAIL'
  let cors: CheckResult = 'FAIL'
  let corsFinding: string | null = null
  let startProbe: RangeProbe | null = null
  let middleProbe: RangeProbe | null = null
  let faststartDetail: R2SelfTestRunResult['faststartDetail'] = null

  try {
    const getRes = await timedFetch(fetchImpl, playbackPublicUrl, {
      method: 'GET',
      headers: { Origin: PLAYBACK_SITE_ORIGIN },
    })
    const fullBody = new Uint8Array(await getRes.arrayBuffer())
    publicHttp = {
      status: getRes.status,
      contentType: header(getRes, 'content-type'),
      contentLength: header(getRes, 'content-length'),
      etag: header(getRes, 'etag'),
      cacheControl: header(getRes, 'cache-control'),
      acceptRanges: header(getRes, 'accept-ranges'),
    }
    const declaredLen = parseContentLength(publicHttp.contentLength)
    const typeOk = (publicHttp.contentType ?? '').toLowerCase().includes('video/mp4')
    publicGet =
      getRes.status === 200 &&
      typeOk &&
      (declaredLen === null || declaredLen === playback.bytes) &&
      fullBody.byteLength === playback.bytes
        ? 'PASS'
        : 'FAIL'

    const size = declaredLen ?? fullBody.byteLength
    startProbe = await probeRange(fetchImpl, playbackPublicUrl, START_RANGE.start, START_RANGE.end)
    rangeStart =
      startProbe.status === 206 &&
      startProbe.bodyBytes === 1024 &&
      (startProbe.contentRange ?? '').startsWith('bytes 0-1023/')
        ? 'PASS'
        : 'FAIL'

    const middleStart = Math.max(1024, Math.floor(size / 2))
    const middleEnd = Math.min(size - 1, middleStart + 1023)
    const expectedMiddle = middleEnd - middleStart + 1
    middleProbe = await probeRange(fetchImpl, playbackPublicUrl, middleStart, middleEnd)
    rangeMiddle =
      middleProbe.status === 206 &&
      middleProbe.bodyBytes === expectedMiddle &&
      (middleProbe.contentRange ?? '') === `bytes ${middleStart}-${middleEnd}/${size}`
        ? 'PASS'
        : 'FAIL'

    const remoteBoxes = findMp4BoxOffsets(fullBody)
    const moovBeforeMdat =
      remoteBoxes.moov !== null &&
      remoteBoxes.mdat !== null &&
      remoteBoxes.moov < remoteBoxes.mdat
    faststartDetail = {
      moovOffset: remoteBoxes.moov,
      mdatOffset: remoteBoxes.mdat,
      moovBeforeMdat,
    }
    faststart = moovBeforeMdat ? 'PASS' : 'FAIL'

    const getAcao = header(getRes, 'access-control-allow-origin')
    let optionsAcao: string | null = null
    let optionsStatus: number | null = null
    try {
      const optRes = await timedFetch(fetchImpl, playbackPublicUrl, {
        method: 'OPTIONS',
        headers: {
          Origin: PLAYBACK_SITE_ORIGIN,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'range',
        },
      })
      optionsStatus = optRes.status
      optionsAcao = header(optRes, 'access-control-allow-origin')
    } catch {
      optionsStatus = null
    }

    const getCorsOk = corsAllowsNahaber(getAcao)
    const rangeCorsOk =
      corsAllowsNahaber(startProbe.accessControlAllowOrigin) &&
      corsAllowsNahaber(middleProbe.accessControlAllowOrigin)
    const optionsCorsOk =
      optionsStatus !== null &&
      optionsStatus < 400 &&
      corsAllowsNahaber(optionsAcao)

    if (getCorsOk && rangeCorsOk) {
      cors = 'PASS'
      corsFinding = optionsCorsOk
        ? null
        : `OPTIONS preflight incomplete (${optionsStatus ?? 'n/a'}); GET and Range ACAO allowed ${PLAYBACK_SITE_ORIGIN}`
    } else {
      cors = 'FAIL'
      corsFinding = `missing CORS for ${PLAYBACK_SITE_ORIGIN} (GET ACAO=${getAcao ?? 'none'}; Range ACAO=${startProbe.accessControlAllowOrigin ?? 'none'}/${middleProbe.accessControlAllowOrigin ?? 'none'}; OPTIONS ${optionsStatus ?? 'n/a'} ACAO=${optionsAcao ?? 'none'})`
    }
  } catch {
    publicGet = 'FAIL'
    rangeStart = 'FAIL'
    rangeMiddle = 'FAIL'
    faststart = 'FAIL'
    cors = 'FAIL'
    corsFinding = 'public HTTP probe failed'
  }

  return {
    action: 'run',
    configured: true,
    validationId,
    upload,
    publicGet,
    rangeStart,
    rangeMiddle,
    faststart,
    cors,
    cleanupRequired: true,
    objects: { original, poster, playback },
    publicHttp,
    range: { start: startProbe, middle: middleProbe },
    faststartDetail,
    corsFinding,
    playbackPublicUrl,
    posterPublicUrl,
  }
}

async function probeRange(
  fetchImpl: typeof fetch,
  url: string,
  start: number,
  end: number,
): Promise<RangeProbe> {
  const expectedBytes = end - start + 1
  try {
    const res = await timedFetch(fetchImpl, url, {
      method: 'GET',
      headers: {
        Range: `bytes=${start}-${end}`,
        Origin: PLAYBACK_SITE_ORIGIN,
      },
    })
    const body = new Uint8Array(await res.arrayBuffer())
    return {
      status: res.status,
      contentRange: header(res, 'content-range'),
      bodyBytes: body.byteLength,
      expectedBytes,
      accessControlAllowOrigin: header(res, 'access-control-allow-origin'),
    }
  } catch {
    return {
      status: null,
      contentRange: null,
      bodyBytes: null,
      expectedBytes,
      accessControlAllowOrigin: null,
    }
  }
}

export async function cleanupR2SelfTest(
  validationIdRaw: string,
  deps: R2SelfTestDeps = {},
): Promise<R2SelfTestCleanupResult> {
  const configured = deps.configured ?? isR2Configured()
  const validationId = assertSafeValidationId(validationIdRaw)
  const keys = allValidationKeys(validationId)

  if (!configured) {
    return {
      action: 'cleanup',
      configured: false,
      validationId,
      createdCount: keys.length,
      deletedCount: 0,
      remainingCount: null,
      cleanup: 'SKIP',
    }
  }

  const storage = resolveStorage(deps)
  let deletedCount = 0
  for (const key of keys) {
    try {
      await storage.delete(key)
      deletedCount += 1
    } catch {
      // continue; remainingCount captures leftovers
    }
  }

  let remaining = 0
  for (const key of keys) {
    try {
      if (await storage.exists(key)) remaining += 1
    } catch {
      remaining += 1
    }
  }

  return {
    action: 'cleanup',
    configured: true,
    validationId,
    createdCount: keys.length,
    deletedCount,
    remainingCount: remaining,
    cleanup: remaining === 0 ? 'PASS' : 'FAIL',
  }
}
