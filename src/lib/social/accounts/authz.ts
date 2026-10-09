/**
 * Who may manage (connect / change / disconnect) social accounts.
 *
 * Decision for this phase — central administrators only:
 *   - permission `system:settings` → today exactly super_admin + managing_editor,
 *     the same set that manages the Onyeditivi token / Facebook app screens
 *     (/api/admin/social/token, /facebook-app). Nobody gains or loses access.
 *   - `social:manage` is NOT used yet: in the current matrix only super_admin
 *     holds it, so switching would lock managing_editor out of Onyeditivi.
 *   - staff with a province/category scope (`users/{uid}.cmsScope`) are refused.
 *     verifyCmsToken already rejects scoped staff on routes that don't opt in;
 *     province-scoped account management comes when account ownership checks
 *     and their tests are in place.
 */
import 'server-only'
import type { CmsAuthContext } from '@/lib/cmsAuthServer'
import { resolveCmsAuthForUid } from '@/lib/cmsAuthServer'
import { hasPermission, type CmsPermission } from '@/types/cms'
import type { SocialAccountOwnership } from './types'

export const SOCIAL_ACCOUNT_MANAGE_PERMISSION: CmsPermission = 'system:settings'

export function canManageSocialAccounts(ctx: CmsAuthContext | null | undefined): boolean {
  if (!ctx) return false
  if (ctx.scope.kind !== 'unscoped') return false
  return ctx.role === 'super_admin' || hasPermission(ctx.role, SOCIAL_ACCOUNT_MANAGE_PERMISSION)
}

/** Ownership-level check. Central admins manage every province/publisher for now. */
export function canManageSocialAccountOwnership(
  ctx: CmsAuthContext | null | undefined,
  _ownership: SocialAccountOwnership,
): boolean {
  return canManageSocialAccounts(ctx)
}

/**
 * Re-check, at OAuth callback time, that the user who started the flow is
 * STILL allowed to manage accounts for that ownership scope.
 */
export async function recheckSocialAccountManager(
  uid: string,
  ownership: SocialAccountOwnership,
): Promise<CmsAuthContext | null> {
  const ctx = await resolveCmsAuthForUid(uid, SOCIAL_ACCOUNT_MANAGE_PERMISSION)
  return canManageSocialAccountOwnership(ctx, ownership) ? ctx : null
}
