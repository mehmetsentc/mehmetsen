/**
 * Resolve the social actor for a request: Firebase ID token (any NaHaber user),
 * plus — when present — CMS role/scope and publisher memberships. Rights come
 * only from these server-side sources, never from the request body.
 */
import 'server-only'
import { resolveCmsAuthForUid, type CmsAuthContext } from '@/lib/cmsAuthServer'
import { staffTierOf } from '@/lib/cms/rbacScope'
import { roleHasPermission } from '@/lib/publisher/authorization'
import { hasPermission } from '@/types/cms'
import type { PublisherMemberRole } from '@/types/publisher'
import { canManageSocialAccounts } from './authz'
import type { SocialActor } from './access'

export type { SocialActor } from './access'

export function actorFromCms(uid: string, cms: CmsAuthContext | null, publishers: Array<{ id: string; role: PublisherMemberRole; name?: string }> = []): SocialActor {
  const provinces =
    cms && cms.scope.kind === 'scoped' && staffTierOf(cms.scope) === 'province_general' ? [...cms.scope.scope.provinceSlugs] : []
  return {
    uid,
    central: canManageSocialAccounts(cms),
    provinces,
    publisherManage: publishers.filter((p) => roleHasPermission(p.role, 'team:manage')).map((p) => p.id),
    publisherPublish: publishers.filter((p) => roleHasPermission(p.role, 'content:publish')).map((p) => p.id),
    isStaff: !!cms,
    publisherNames: Object.fromEntries(publishers.map((p) => [p.id, p.name ?? p.id])),
    newsPublisher: !!cms && hasPermission(cms.role, 'news:publish'),
    staffScope:
      cms && cms.scope.kind === 'scoped'
        ? { provinces: [...cms.scope.scope.provinceSlugs], districts: [...cms.scope.scope.districtSlugs], categories: [...cms.scope.scope.categoryIds] }
        : null,
  }
}

async function publishersFor(uid: string): Promise<Array<{ id: string; role: PublisherMemberRole; name?: string }>> {
  try {
    const { publisherRepository } = await import('@/services/publisher/publisherRepository')
    const rows = await publisherRepository.listPublishersForUser(uid)
    return rows.map((r) => ({ id: r.id, role: r.role, name: (r as { name?: string }).name }))
  } catch {
    // No publisher database / not a member → no publisher rights (fail closed).
    return []
  }
}

/** Current rights of a uid (also used to re-check at OAuth callback time). */
export async function resolveSocialActorForUid(uid: string): Promise<SocialActor | null> {
  if (typeof uid !== 'string' || !uid.trim()) return null
  try {
    const { getAdminAuth } = await import('@/lib/firebase/admin')
    const record = await getAdminAuth().getUser(uid)
    if (record.disabled) return null
  } catch {
    return null
  }
  const [cms, publishers] = await Promise.all([
    resolveCmsAuthForUid(uid, undefined, { scopeAware: true }).catch(() => null),
    publishersFor(uid),
  ])
  return actorFromCms(uid, cms, publishers)
}

export async function resolveSocialActor(request: Request): Promise<SocialActor | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7).trim()
  if (!token) return null
  let uid: string
  try {
    const { getAdminAuth } = await import('@/lib/firebase/admin')
    uid = (await getAdminAuth().verifyIdToken(token)).uid
  } catch {
    return null
  }
  return resolveSocialActorForUid(uid)
}
