/** Safe post-auth return path (e.g. back to a game after üye ol). */

const STORAGE_KEY = 'nahaber_auth_next'

export function sanitizeReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null
  const path = raw.trim()
  if (!path.startsWith('/')) return null
  if (path.startsWith('//')) return null
  if (path.startsWith('/login') || path.startsWith('/register')) return null
  if (path.includes('://')) return null
  return path
}

export function rememberReturnPath(path: string): void {
  const safe = sanitizeReturnPath(path)
  if (!safe || typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, safe)
  } catch {
    /* ignore */
  }
}

export function peekReturnPath(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return sanitizeReturnPath(sessionStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

export function consumeReturnPath(): string | null {
  const path = peekReturnPath()
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
  return path
}

export function registerHrefWithNext(nextPath: string): string {
  const safe = sanitizeReturnPath(nextPath)
  if (!safe) return '/register'
  return `/register?next=${encodeURIComponent(safe)}`
}

export function loginHrefWithNext(nextPath: string | null): string {
  const safe = sanitizeReturnPath(nextPath)
  if (!safe) return '/login'
  return `/login?next=${encodeURIComponent(safe)}`
}
