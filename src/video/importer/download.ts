import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { videoLibraryMaxBytes } from '@/video/featureFlag'
import {
  assertPublicDownloadUrl,
  UnsafeDownloadUrlError,
  type DnsLookup,
} from '@/video/security/ssrf'

export type DownloadedFile = {
  tempPath: string
  mimeType: string
  fileSizeBytes: number
  contentHash: string
  ext: string
}

const ALLOWED_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
  'video/mpeg',
])

const MIME_TO_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
  'video/mpeg': 'mpg',
}

export class DownloadFailedError extends Error {
  readonly code: string
  constructor(code: string, message = code) {
    super(message)
    this.name = 'DownloadFailedError'
    this.code = code
  }
}

export async function cleanupTempFile(path: string | null | undefined): Promise<void> {
  if (!path) return
  try {
    await unlink(path)
  } catch {
    // already gone
  }
}

function mimeFromHeader(raw: string | null, fallbackExt: string): string {
  const mime = (raw ?? '').split(';')[0].trim().toLowerCase()
  if (ALLOWED_MIME.has(mime)) return mime
  if (mime === 'application/octet-stream' || mime === '') {
    if (fallbackExt === 'mp4') return 'video/mp4'
    if (fallbackExt === 'webm') return 'video/webm'
    if (fallbackExt === 'mov') return 'video/quicktime'
    if (fallbackExt === 'm4v') return 'video/x-m4v'
  }
  throw new DownloadFailedError('INVALID_MIME')
}

type FetchLike = typeof fetch

export async function downloadVideoFile(input: {
  url: string
  suggestedExt: string
  maxBytes?: number
  timeoutMs?: number
  maxRedirects?: number
  fetchImpl?: FetchLike
  lookup?: DnsLookup
}): Promise<DownloadedFile> {
  const maxBytes = input.maxBytes ?? videoLibraryMaxBytes()
  const timeoutMs = input.timeoutMs ?? 60_000
  const maxRedirects = input.maxRedirects ?? 3
  const fetchImpl = input.fetchImpl ?? fetch

  let current = input.url
  let res: Response | null = null
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicDownloadUrl(current, input.lookup)
    res = await fetchImpl(current, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'video/*,application/octet-stream;q=0.9,*/*;q=0.1' },
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) throw new DownloadFailedError('REDIRECT_MISSING')
      current = new URL(loc, current).href
      continue
    }
    break
  }
  if (!res) throw new DownloadFailedError('EMPTY_RESPONSE')
  if (!res.ok) throw new DownloadFailedError('HTTP_ERROR')
  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
    throw new DownloadFailedError('TOO_MANY_REDIRECTS')
  }

  const length = Number(res.headers.get('content-length') ?? '')
  if (Number.isFinite(length) && length > maxBytes) {
    throw new DownloadFailedError('FILE_TOO_LARGE')
  }

  const mimeType = mimeFromHeader(res.headers.get('content-type'), input.suggestedExt)
  const ext = MIME_TO_EXT[mimeType] ?? input.suggestedExt
  if (!res.body) throw new DownloadFailedError('EMPTY_BODY')

  const tempPath = join(tmpdir(), `vl-import-${crypto.randomUUID()}.${ext}`)
  const hash = createHash('sha256')
  let fileSizeBytes = 0
  const nodeReadable = Readable.fromWeb(res.body as never)

  try {
    await pipeline(
      nodeReadable,
      async function* (source) {
        for await (const chunk of source) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          fileSizeBytes += buf.length
          if (fileSizeBytes > maxBytes) throw new DownloadFailedError('FILE_TOO_LARGE')
          hash.update(buf)
          yield buf
        }
      },
      createWriteStream(tempPath)
    )
  } catch (err) {
    await cleanupTempFile(tempPath)
    if (err instanceof DownloadFailedError || err instanceof UnsafeDownloadUrlError) throw err
    throw new DownloadFailedError('DOWNLOAD_FAILED')
  }

  if (fileSizeBytes <= 0) {
    await cleanupTempFile(tempPath)
    throw new DownloadFailedError('EMPTY_BODY')
  }

  return {
    tempPath,
    mimeType,
    fileSizeBytes,
    contentHash: hash.digest('hex'),
    ext,
  }
}
