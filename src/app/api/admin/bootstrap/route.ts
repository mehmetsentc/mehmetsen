/**
 * POST /api/admin/bootstrap
 * One-time: Sets super_admin role for the configured super admin email.
 * Protected: only callable by the super admin themselves (must be authenticated).
 * Idempotent: safe to call multiple times.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'

export async function POST(request: Request) {
  // Only super admin can bootstrap
  const auth = await verifyCmsToken(request)
  if (!auth || auth.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden: super_admin only' }, { status: 403 })
  }

  try {
    const { getAdminFirestore } = await import('@/lib/firebase/admin')
    const adminDb = getAdminFirestore()

    const userSnap = await adminDb.collection('users').where('email', '==', auth.email).limit(1).get()

    if (userSnap.empty) {
      return NextResponse.json({ error: 'User document not found. Sign up first.' }, { status: 404 })
    }

    const userDocRef = userSnap.docs[0].ref
    const currentData = userSnap.docs[0].data()

    if (currentData.role === 'super_admin') {
      return NextResponse.json({ message: 'Already super_admin', uid: auth.uid })
    }

    await userDocRef.update({
      role: 'super_admin',
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      message: `Role set to super_admin for ${auth.email}`,
      uid: auth.uid,
    })
  } catch (error) {
    console.error('[bootstrap]', error)
    return NextResponse.json({ error: 'Bootstrap failed' }, { status: 500 })
  }
}
