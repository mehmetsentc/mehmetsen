import { NextResponse } from 'next/server'
import { resolveCmsRoleFromFirestore } from '@/lib/cmsRoleUtils'
import type { CmsRole } from '@/types/cms'
import { getBootstrapAdminUids, isSuperAdminEmailServer } from '@/lib/cmsSecrets.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
      return NextResponse.json({ role: targetRole, synced: true })
    }

    const role = userSnap.exists
      ? resolveCmsRoleFromFirestore(userSnap.data()?.role as string)
      : 'user'
    return NextResponse.json({ role, synced: false })
  } catch (error) {
    console.error('[api/auth/cms-sync]', error)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
