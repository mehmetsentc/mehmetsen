/**
 * Edge-safe CMS session token (HS256-ish).
 *
 * - Web Crypto API kullanır → hem Node hem Edge runtime çalışır.
 * - Tek amaç: middleware'de `/admin/*` rotasını anonim isteklerden korumak.
 * - Gerçek yetki/role kontrolü API route'larında `verifyCmsToken` (Firebase
 *   ID token) ile yapılır. Bu cookie tek başına yetki vermez.
 *
 * Secret: process.env.CMS_SESSION_SECRET (zorunlu).
 *
 * FAIL-CLOSED: Bu değişken production'da tanımlı değilse, hiçbir public/
 * development/hardcoded fallback değere DÜŞÜLMEZ. Bunun yerine:
 *   - signCmsSessionToken(): null döner (cookie set edilmez)
 *   - verifyCmsSessionToken(): null döner (session geçersiz sayılır)
 * Yani secret eksikse CMS session özelliği sessizce devre dışı kalır;
 * middleware `/admin/*` için her zaman `/login`'e yönlendirir. Bu, bilinen/
 * tahmin edilebilir bir secret ile sahte session üretilebilmesinden çok
 * daha güvenlidir (SEC-001 containment + permanent fix).
 */
import type { CmsRole } from '@/types/cms'

export interface CmsSessionPayload {
  uid: string
  role: CmsRole
  /** Unix saniye */
  exp: number
}

const encoder = new TextEncoder()

function base64UrlEncode(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * Production'da zorunlu, tek kaynak: CMS_SESSION_SECRET.
 * Eksikse null döner — hiçbir fallback (NEXTAUTH_SECRET dahil) veya
 * hardcoded değer KULLANILMAZ. Çağıranlar null'u "secret yok, fail closed"
 * olarak ele almalıdır.
 */
function getSecretKey(): string | null {
  const secret = process.env.CMS_SESSION_SECRET
  return secret && secret.length > 0 ? secret : null
}

async function hmac(payload: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return new Uint8Array(sig)
}

/**
 * CMS_SESSION_SECRET yoksa null döner (cookie set edilmez). Bu, açıkça
 * catch edilmesi gereken bir hata DEĞİL, normal ve beklenen bir "secret
 * yapılandırılmamış" durumudur — çağıran taraf (cms-sync route'u) cookie
 * set etmeyi atlayarak devam eder.
 */
export async function signCmsSessionToken(payload: CmsSessionPayload): Promise<string | null> {
  const secret = getSecretKey()
  if (!secret) return null
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  const sig = base64UrlEncode(await hmac(body, secret))
  return `${body}.${sig}`
}

export async function verifyCmsSessionToken(token: string | undefined): Promise<CmsSessionPayload | null> {
  const secret = getSecretKey()
  if (!secret) return null
  if (!token || typeof token !== 'string') return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = base64UrlEncode(await hmac(body, secret))
  // Sabit zamanlı karşılaştırma (string eşitliği yeterince yakın; cookie değil
  // payload uzunluğu değişken değil)
  if (expected.length !== sig.length) return null
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  }
  if (diff !== 0) return null

  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as CmsSessionPayload
    if (typeof parsed.uid !== 'string' || typeof parsed.role !== 'string') return null
    if (typeof parsed.exp !== 'number' || parsed.exp < Math.floor(Date.now() / 1000)) return null
    return parsed
  } catch {
    return null
  }
}
