import type { User } from '@/types/user'
import { getBootstrapAdminUids } from '@/lib/eventSyncAuth'

export { getBootstrapAdminUids } from '@/lib/eventSyncAuth'

export function isBootstrapAdmin(uid: string): boolean {
  return getBootstrapAdminUids().includes(uid)
}

/** True when NEXT_PUBLIC_ADMIN_UIDS lists at least one UID. */
export function isBootstrapAdminConfigured(): boolean {
  return getBootstrapAdminUids().length > 0
}

/** Env line to paste into `.env.local` for local admin access. */
export function buildAdminEnvLine(uid: string): string {
  return `NEXT_PUBLIC_ADMIN_UIDS=${uid}`
}

/** Promote bootstrap UIDs to admin in memory (Firestore may still need sync). */
export function applyAdminBootstrap(user: User): User {
  if (user.role === 'admin' || !isBootstrapAdmin(user.uid)) return user
  return { ...user, role: 'admin' }
}

export function isAdminUser(user: User | null | undefined): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  return isBootstrapAdmin(user.uid)
}

/** Sync bootstrap admin role to Firestore via server API (no-op if not configured). */
export async function syncBootstrapAdminRole(idToken: string): Promise<void> {
  try {
    const res = await fetch('/api/admin/bootstrap', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    })
    if (!res.ok) return
  } catch {
    // Service account may be unset in local dev — set role in Firebase Console instead.
  }
}
