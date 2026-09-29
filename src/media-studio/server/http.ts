import { assertSafeUrl, UnsafeUrlError } from '@/services/crawler/url/ssrf'

const MAX_REDIRECTS = 4
export const MAX_DOWNLOAD_BYTES = 40 * 1024 * 1024

export class StudioHttpError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StudioHttpError'
  }
}

async function assertPublic(url: string): Promise<URL> {
  try {
    return await assertSafeUrl(url)
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw new StudioHttpError('Bu adres indirilemez.')
    throw error
  }
}

export async function safeFetch(
  rawUrl: string,
  options?: { maxBytes?: number; timeoutMs?: number; truncate?: boolean }
): Promise<{ finalUrl: string; status: number; contentType: string; body: Buffer }> {
  const maxBytes = options?.maxBytes ?? 500_000
  const timeoutMs = options?.timeoutMs ?? 15_000
  const truncate = options?.truncate === true
  let current = rawUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = await assertPublic(current)
    const response = await fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'NaHaberMediaStudio/1.0',
        Accept: 'text/html,application/xhtml+xml,image/*,video/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new StudioHttpError('Yönlendirme adresi yok.')
      current = new URL(location, url).href
      continue
    }
    if (!response.ok) throw new StudioHttpError(`Kaynak yanıtı ${response.status}.`)
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
    const lengthHeader = Number(response.headers.get('content-length') ?? '')
    if (!truncate && Number.isFinite(lengthHeader) && lengthHeader > maxBytes) {
      throw new StudioHttpError('Dosya indirme sınırını aşıyor.')
    }
    const reader = response.body?.getReader()
    if (!reader) throw new StudioHttpError('Kaynak gövdesi boş.')
    const chunks: Uint8Array[] = []
    let loaded = 0
    while (true) {
      const step = await reader.read()
      if (step.done) break
      loaded += step.value.byteLength
      if (loaded > maxBytes) {
        await reader.cancel()
        if (truncate) break
        throw new StudioHttpError('Dosya indirme sınırını aşıyor.')
      }
      chunks.push(step.value)
    }
    return { finalUrl: url.href, status: response.status, contentType, body: Buffer.concat(chunks) }
  }
  throw new StudioHttpError('Çok fazla yönlendirme.')
}

export async function safeDownload(
  rawUrl: string,
  onProgress: (loaded: number, total: number | null) => void
): Promise<{ finalUrl: string; contentType: string; body: Buffer; total: number | null }> {
  let current = rawUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = await assertPublic(current)
    const response = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'NaHaberMediaStudio/1.0', Accept: '*/*' },
      signal: AbortSignal.timeout(50_000),
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new StudioHttpError('Yönlendirme adresi yok.')
      current = new URL(location, url).href
      continue
    }
    if (!response.ok) throw new StudioHttpError(`İndirme yanıtı ${response.status}.`)
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
    const lengthHeader = Number(response.headers.get('content-length') ?? '')
    const total = Number.isFinite(lengthHeader) && lengthHeader > 0 ? lengthHeader : null
    if (total != null && total > MAX_DOWNLOAD_BYTES) throw new StudioHttpError('Dosya 40 MB sınırını aşıyor.')
    const reader = response.body?.getReader()
    if (!reader) throw new StudioHttpError('İndirilecek gövde yok.')
    const chunks: Uint8Array[] = []
    let loaded = 0
    while (true) {
      const step = await reader.read()
      if (step.done) break
      loaded += step.value.byteLength
      if (loaded > MAX_DOWNLOAD_BYTES) {
        await reader.cancel()
        throw new StudioHttpError('Dosya 40 MB sınırını aşıyor.')
      }
      chunks.push(step.value)
      onProgress(loaded, total)
    }
    return { finalUrl: url.href, contentType, body: Buffer.concat(chunks), total }
  }
  throw new StudioHttpError('Çok fazla yönlendirme.')
}
