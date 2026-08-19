import { crawlerTickLimits } from '../enabled'
import { logCrawler } from '../log'
import { hostnameOf } from '../url/normalize'
import { UnsafeUrlError, assertSafeUrl, type HostLookup } from '../url/ssrf'
import { noteHttpStatus, waitForDomainSlot } from './politeness'

export type FetchImpl = (
  url: string,
  init?: RequestInit
) => Promise<Response>

export interface ConditionalGet {
  etag?: string | null
  lastModified?: string | null
}

export interface DocumentFetchResult {
  ok: boolean
  status: number
  url: string
  finalUrl: string
  body: string
  etag: string | null
  lastModified: string | null
  notModified: boolean
  durationMs: number
  errorCode?: string
}

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': 'NaHaberBot/0.1 (+https://www.nahaber.com/bot)',
  Accept: 'text/html,application/xhtml+xml,application/xml,application/rss+xml,application/atom+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en,tr;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
}

const MAX_REDIRECTS = 5

export async function fetchDocument(opts: {
  url: string
  fetchImpl?: FetchImpl
  lookup?: HostLookup
  timeoutMs?: number
  maxBytes?: number
  conditional?: ConditionalGet
  skipPoliteness?: boolean
  sourceId?: string
}): Promise<DocumentFetchResult> {
  const limits = crawlerTickLimits()
  const timeoutMs = opts.timeoutMs ?? limits.requestTimeoutMs
  const maxBytes = opts.maxBytes ?? limits.maxBodyBytes
  const fetchImpl = opts.fetchImpl ?? fetch
  const started = Date.now()

  let current = opts.url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    try {
      await assertSafeUrl(current, opts.lookup)
    } catch (err) {
      const code = err instanceof UnsafeUrlError ? err.code : 'SSRF_BLOCKED'
      logCrawler({
        sourceId: opts.sourceId,
        url: current,
        stage: 'fetch',
        errorCode: code,
        durationMs: Date.now() - started,
      })
      return {
        ok: false,
        status: 0,
        url: opts.url,
        finalUrl: current,
        body: '',
        etag: null,
        lastModified: null,
        notModified: false,
        durationMs: Date.now() - started,
        errorCode: code,
      }
    }

    const host = hostnameOf(current)
    if (host && !opts.skipPoliteness) {
      await waitForDomainSlot(host, limits.minRequestIntervalMs)
    }

    const headers: Record<string, string> = { ...DEFAULT_HEADERS }
    if (opts.conditional?.etag) headers['If-None-Match'] = opts.conditional.etag
    if (opts.conditional?.lastModified) {
      headers['If-Modified-Since'] = opts.conditional.lastModified
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetchImpl(current, {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: controller.signal,
      })
    } catch (err) {
      const errorCode = err instanceof Error && err.name === 'AbortError' ? 'TIMEOUT' : 'FETCH_ERROR'
      return {
        ok: false,
        status: 0,
        url: opts.url,
        finalUrl: current,
        body: '',
        etag: null,
        lastModified: null,
        notModified: false,
        durationMs: Date.now() - started,
        errorCode,
      }
    } finally {
      clearTimeout(timer)
    }

    if (host) noteHttpStatus(host, res.status, limits.minRequestIntervalMs)

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location')
      if (!location) {
        return emptyResult(opts.url, current, res.status, started, 'REDIRECT_MISSING')
      }
      try {
        current = new URL(location, current).toString()
      } catch {
        return emptyResult(opts.url, current, res.status, started, 'REDIRECT_INVALID')
      }
      continue
    }

    if (res.status === 304) {
      return {
        ok: true,
        status: 304,
        url: opts.url,
        finalUrl: current,
        body: '',
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
        notModified: true,
        durationMs: Date.now() - started,
      }
    }

    const buf = Buffer.from(await res.arrayBuffer())
    const sliced = buf.byteLength > maxBytes ? buf.subarray(0, maxBytes) : buf
    const body = sliced.toString('utf8')

    logCrawler({
      sourceId: opts.sourceId,
      url: current,
      stage: 'fetch',
      httpStatus: res.status,
      durationMs: Date.now() - started,
    })

    return {
      ok: res.ok,
      status: res.status,
      url: opts.url,
      finalUrl: current,
      body,
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
      notModified: false,
      durationMs: Date.now() - started,
    }
  }

  return emptyResult(opts.url, current, 0, started, 'TOO_MANY_REDIRECTS')
}

function emptyResult(
  url: string,
  finalUrl: string,
  status: number,
  started: number,
  errorCode: string
): DocumentFetchResult {
  return {
    ok: false,
    status,
    url,
    finalUrl,
    body: '',
    etag: null,
    lastModified: null,
    notModified: false,
    durationMs: Date.now() - started,
    errorCode,
  }
}
