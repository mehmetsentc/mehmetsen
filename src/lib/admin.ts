import type { User } from '@/types/user'
import { canAccessCms } from '@/lib/cmsAuth'

/** @deprecated Roles are managed in Firestore — no client-side UID bootstrap. */
export function isBootstrapAdmin(_uid: string): boolean {
  return false
}

/** @deprecated */
export function isBootstrapAdminConfigured(): boolean {
  return false
}

/** @deprecated Use ADMIN_BOOTSTRAP_UIDS server env + /api/admin/bootstrap instead. */
export function buildAdminEnvLine(uid: string): string {
  return `ADMIN_BOOTSTRAP_UIDS=${uid}`
}

/** No-op — client must not promote roles in memory. */
export function applyAdminBootstrap(user: User): User {
  return user
}

/** True when user has CMS staff access. */
export function isAdminUser(user: User | null | undefined): boolean {
  return canAccessCms(user)
}

/** Sync CMS role from server (super admin email / bootstrap UID) into Firestore. */
export async function syncCmsRoleFromServer(idToken: string): Promise<void> {
  try {
    const res = await fetch('/api/auth/cms-sync', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    })
    if (!res.ok) return
  } catch {
    // Non-fatal — Firestore role may already be correct.
  }
}

/** @deprecated Use syncCmsRoleFromServer */
export async function syncBootstrapAdminRole(idToken: string): Promise<void> {
  await syncCmsRoleFromServer(idToken)
}
