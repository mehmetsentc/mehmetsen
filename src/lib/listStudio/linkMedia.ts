import 'server-only'

/**
 * Bağlantıdan medya alma (Etkinlik / Liste stüdyosu): kullanıcının verdiği https bağlantısı
 * bir kez indirilir ve kendi Storage klasörüne kopyalanır; render artık yalnız bizim kopyamızı okur.
 *
 * SSRF koruması: yalnız https, 443; IP / localhost / iç alan adı yok; DNS çözümü özel ağa düşerse
 * reddedilir; yönlendirmeler elle izlenir (en çok 3) ve her adımda yeniden denetlenir.
 * Sayfa bağlantıları (YouTube, Instagram gönderisi…) desteklenmez: doğrudan video / görsel dosyası gerekir.
 */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { randomBytes } from 'node:crypto'
import { getAdminStorage } from '@/lib/firebase/admin'

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET ?? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
const MAX_VIDEO = 200 * 1024 * 1024
const MAX_IMAGE = 10 * 1024 * 1024

export class LinkMediaError extends Error {
  constructor(message: string, public readonly code = 'link_invalid') {
    super(message)
    this.name = 'LinkMediaError'
  }
}

function privateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number) as [number, number]
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
}
function privateV6(ip: string): boolean {
  const x = ip.toLowerCase()
  if (x === '::1' || x === '::') return true
  if (x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb')) return true
  const m = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return m ? privateV4(m[1]!) : false
}

/** Bağlantı herkese açık bir https adresi mi (DNS dâhil). */
export async function assertPublicHttps(raw: string): Promise<URL> {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new LinkMediaError('Bağlantı geçersiz')
  }
  if (u.protocol !== 'https:') throw new LinkMediaError('Yalnız https bağlantıları kabul edilir')
  if (u.port && u.port !== '443') throw new LinkMediaError('Bağlantı portu desteklenmiyor')
  if (u.username || u.password) throw new LinkMediaError('Bağlantıda kullanıcı bilgisi olamaz')
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (isIP(host) || host === 'localhost' || !host.includes('.') || /\.(local|internal|localhost|lan|home|corp)$/.test(host)) throw new LinkMediaError('Bu adres kullanılamaz')
  let addrs: Array<{ address: string; family: number }>
  try {
    addrs = await lookup(host, { all: true })
  } catch {
    throw new LinkMediaError('Alan adı bulunamadı')
  }
  if (!addrs.length || addrs.some((a) => (a.family === 6 ? privateV6(a.address) : privateV4(a.address)))) throw new LinkMediaError('Bu adres kullanılamaz')
  return u
}

const PAGE_HOSTS = /(^|\.)(youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.watch|tiktok\.com|x\.com|twitter\.com|threads\.net|vimeo\.com|spotify\.com)$/i

export type LinkedMedia = { url: string; kind: 'video' | 'image' | 'audio'; name: string; bytes: number }

/** Bağlantıyı indirir, türünü doğrular ve news-videos|news-images/{uid}/lists/{listId}/ altına kopyalar. */
export async function importLinkMedia(raw: string, uid: string, listId: string, opts: { audio?: boolean } = {}): Promise<LinkedMedia> {
  let u = await assertPublicHttps(raw)
  if (PAGE_HOSTS.test(u.hostname)) throw new LinkMediaError('Bu bir sayfa bağlantısı. Videonun / görselin doğrudan dosya bağlantısını (.mp4, .jpg…) verin ya da dosyayı cihazdan yükleyin.', 'link_page')
  let res: Response | null = null
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(90_000), headers: { 'user-agent': 'Mozilla/5.0 (NaHaber media import)' } })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc || hop === 3) throw new LinkMediaError('Bağlantı çok fazla yönlendiriyor')
      u = await assertPublicHttps(new URL(loc, u).toString())
      continue
    }
    break
  }
  if (!res || !res.ok) throw new LinkMediaError(`Dosya indirilemedi (HTTP ${res?.status ?? '?'})`)
  const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  const kind: 'video' | 'image' | 'audio' | null =
    opts.audio && (type.startsWith('audio/') || (type === 'application/octet-stream' && /\.(mp3|m4a|aac|wav|ogg)$/i.test(u.pathname))) ? 'audio'
    : type.startsWith('video/') || type === 'application/octet-stream' && /\.(mp4|mov|m4v|webm)$/i.test(u.pathname) ? 'video' : type.startsWith('image/') && type !== 'image/svg+xml' ? 'image' : null
  if (!kind) throw new LinkMediaError(type.includes('html') ? 'Bu bir sayfa bağlantısı; doğrudan video / görsel dosyası gerekli (.mp4, .jpg…)' : 'Dosya türü desteklenmiyor (video ya da görsel olmalı)', type.includes('html') ? 'link_page' : 'link_type')
  const max = kind === 'image' ? MAX_IMAGE : MAX_VIDEO
  const len = Number(res.headers.get('content-length') ?? 0)
  if (len > max) throw new LinkMediaError(kind === 'video' ? 'Video 200 MB sınırını aşıyor' : 'Görsel 10 MB sınırını aşıyor', 'too_large')
  // akışı sınırlı oku
  const reader = res.body?.getReader()
  if (!reader) throw new LinkMediaError('Dosya boş')
  const chunks: Uint8Array[] = []
  let bytes = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > max) {
      await reader.cancel().catch(() => undefined)
      throw new LinkMediaError(kind === 'video' ? 'Video 200 MB sınırını aşıyor' : 'Görsel 10 MB sınırını aşıyor', 'too_large')
    }
    chunks.push(value)
  }
  if (!bytes) throw new LinkMediaError('Dosya boş')
  const ext = kind === 'audio' ? (type.includes('mpeg') || /\.mp3$/i.test(u.pathname) ? 'mp3' : type.includes('wav') ? 'wav' : 'm4a') : kind === 'video' ? (type.includes('quicktime') ? 'mov' : type.includes('webm') ? 'webm' : 'mp4') : type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
  const name = `${kind === 'image' ? 'news-images' : 'news-videos'}/${uid}/lists/${listId}/link-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`
  const file = getAdminStorage().bucket(BUCKET).file(name)
  await file.save(Buffer.concat(chunks), { resumable: false, metadata: { contentType: type || (kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/mpeg' : 'image/jpeg'), cacheControl: 'public, max-age=86400', metadata: { source: u.hostname } } })
  await file.makePublic().catch(() => undefined)
  const base = decodeURIComponent(u.pathname.split('/').pop() ?? '').replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 60)
  return { url: `https://storage.googleapis.com/${BUCKET}/${name}`, kind, name: base || `${u.hostname} bağlantısı`, bytes }
}
