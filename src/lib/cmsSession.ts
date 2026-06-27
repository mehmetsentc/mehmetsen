/**
 * Edge-safe CMS session token (HS256-ish).
 *
 * - Web Crypto API kullanır → hem Node hem Edge runtime çalışır.
 * - Tek amaç: middleware'de `/admin/*` rotasını anonim isteklerden korumak.
 * - Gerçek yetki/role kontrolü API route'larında `verifyCmsToken` (Firebase
 *   ID token) ile yapılır. Bu cookie tek başına yetki vermez.
 *
 * Secret: process.env.CMS_SESSION_SECRET (zorunlu — yoksa imza geçersiz olur)
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

function getSecretKey(): string {
  return process.env.CMS_SESSION_SECRET || process.env.NEXTAUTH_SECRET || 'dev-cms-session-secret-change-me'
}

async function hmac(payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecretKey()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return new Uint8Array(sig)
}

export async function signCmsSessionToken(payload: CmsSessionPayload): Promise<string> {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  const sig = base64UrlEncode(await hmac(body))
  return `${body}.${sig}`
}

export async function verifyCmsSessionToken(token: string | undefined): Promise<CmsSessionPayload | null> {
  if (!token || typeof token !== 'string') return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = base64UrlEncode(await hmac(body))
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
