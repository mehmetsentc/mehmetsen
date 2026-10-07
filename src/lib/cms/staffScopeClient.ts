'use client'
/**
 * Phase 2 — client cache of the caller's hierarchy position (/api/admin/me/scope).
 * Scoped editors (il/ilçe/kategori) have no client Firestore access to drafts, so the
 * admin services switch to server-side, scope-filtered endpoints when `scoped` is true.
 * The server re-checks every request; this cache only drives UI routing.
 */
import { auth } from '@/lib/firebase/auth'

export interface MyStaffScope {
  role: string
  scoped: boolean
  tier: string
  provinceSlug: string | null
  districtSlug: string | null
  categoryId: string | null
  canManageStaff: boolean
}

let cached: MyStaffScope | null = null
let inflight: Promise<MyStaffScope | null> | null = null
const listeners = new Set<(s: MyStaffScope | null) => void>()

export function getCachedStaffScope(): MyStaffScope | null {
  return cached
}

export function isScopedEditorSession(): boolean {
  return cached?.scoped === true
}

export function subscribeStaffScope(fn: (s: MyStaffScope | null) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function adminApiFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('Giriş gerekli')
  const token = await user.getIdToken()
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
}

export async function loadMyStaffScope(force = false): Promise<MyStaffScope | null> {
  if (cached && !force) return cached
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const res = await adminApiFetch('/api/admin/me/scope')
      cached = res.ok ? ((await res.json()) as MyStaffScope) : null
    } catch {
      cached = null
    } finally {
      inflight = null
    }
    listeners.forEach((fn) => fn(cached))
    return cached
  })()
  return inflight
}

export function clearStaffScopeCache(): void {
  cached = null
}

/** Admin paths a scoped editor may open; everything else redirects to /admin/news. */
export function isScopedEditorPathAllowed(pathname: string, scope: MyStaffScope): boolean {
  if (pathname === '/admin/news' || pathname.startsWith('/admin/news/')) return true
  if (pathname === '/admin/ads' || pathname.startsWith('/admin/ads/')) return true
  if (scope.canManageStaff && (pathname === '/admin/ekip' || pathname.startsWith('/admin/ekip/'))) return true
  return false
}
