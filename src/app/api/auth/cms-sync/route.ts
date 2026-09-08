import { NextResponse } from 'next/server'
import { resolveCmsRoleFromFirestore } from '@/lib/cmsRoleUtils'
import type { CmsRole } from '@/types/cms'
import { CMS_STAFF_ROLES } from '@/types/cms'
import { getBootstrapAdminUids, isSuperAdminEmailServer } from '@/lib/cmsSecrets.server'
import { signCmsSessionToken } from '@/lib/cmsSession'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CMS_SESSION_COOKIE = 'cms_session'
const CMS_SESSION_MAX_AGE = 60 * 60 // 1 saat

/**
 * POST /api/auth/cms-sync
 * After Google/email login: promote SUPER_ADMIN_EMAIL / bootstrap UIDs in Firestore
 * so client AdminGuard matches server verifyCmsToken.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7).trim()
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { getAdminAuth, getAdminFirestore } = await import('@/lib/firebase/admin')
    const decoded = await getAdminAuth().verifyIdToken(token)
    const email = decoded.email ?? ''
    const uid = decoded.uid

    let targetRole: CmsRole | null = null
    if (isSuperAdminEmailServer(email)) {
      targetRole = 'super_admin'
    } else if (getBootstrapAdminUids().includes(uid)) {
      targetRole = 'managing_editor'
    }

    const db = getAdminFirestore()
    const userRef = db.collection('users').doc(uid)
    const userSnap = await userRef.get()

    if (targetRole) {
      const now = new Date().toISOString()
      if (!userSnap.exists) {
        const base = email.split('@')[0] || uid.slice(0, 8)
        const username = base.replace(/[^a-z0-9_]/gi, '_').toLowerCase()
        await userRef.set({
          uid,
          email,
          username,
          displayName: decoded.name ?? username,
          photoURL: decoded.picture ?? null,
          role: targetRole,
          bio: null,
          website: null,
          location: null,
          isVerified: false,
          isBlocked: false,
          followersCount: 0,
          followingCount: 0,
          postsCount: 0,
          onboardingCompleted: true,
          createdAt: now,
          updatedAt: now,
        })
      } else {
        const current = resolveCmsRoleFromFirestore(userSnap.data()?.role as string)
        if (current !== targetRole) {
          await userRef.update({ role: targetRole, updatedAt: now })
        }
      }
      return jsonWithCmsSession({ role: targetRole, synced: true }, uid, targetRole)
    }

    const role = userSnap.exists
      ? resolveCmsRoleFromFirestore(userSnap.data()?.role as string)
      : 'user'
    return jsonWithCmsSession({ role, synced: false }, uid, role)
  } catch (error) {
    console.error('[api/auth/cms-sync]', error)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

/**
 * CMS sync yanıtına edge-safe imzalı session cookie iliştirir. Cookie sadece
 * `/admin/*` middleware'i için kullanılır — gerçek yetki API route'larında
 * yine `verifyCmsToken` (Firebase ID token) ile kontrol edilir. Yani
 * defense-in-depth; cookie tek başına yetki vermez.
 *
 * - CMS staff için cookie set ediliyor (1 saat).
 * - Staff olmayan kullanıcıda cookie silinir, çünkü `/admin/*`'a erişimi yok.
 * - FAIL-CLOSED: `CMS_SESSION_SECRET` yapılandırılmamışsa `signCmsSessionToken`
 *   null döner. Bu durumda hiçbir fallback/hardcoded secret ile İMZALAMAYIZ —
 *   cookie set edilmez (staff olmayan kullanıcıyla aynı şekilde temizlenir).
 *   Sonuç: `/admin/*` middleware'i her zaman `/login`'e yönlendirir; ancak
 *   role senkronizasyonu (Firestore) ve bu endpoint'in JSON yanıtı normal
 *   şekilde çalışmaya devam eder — sadece CMS session cookie özelliği
 *   secret gelene kadar sessizce devre dışı kalır.
 */
async function jsonWithCmsSession(
  body: Record<string, unknown>,
  uid: string,
  role: CmsRole
) {
  const res = NextResponse.json(body)
  const token = CMS_STAFF_ROLES.includes(role)
    ? await signCmsSessionToken({
        uid,
        role,
        exp: Math.floor(Date.now() / 1000) + CMS_SESSION_MAX_AGE,
      })
    : null

  if (token) {
    res.cookies.set(CMS_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: CMS_SESSION_MAX_AGE,
      path: '/',
    })
  } else {
    res.cookies.set(CMS_SESSION_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    })
  }
  return res
}
