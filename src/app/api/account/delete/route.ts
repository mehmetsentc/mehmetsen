import { NextResponse } from 'next/server'
import { getAdminAuth, getAdminFirestore, Collections } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/account/delete
 *
 * Hesap silme — self-service.
 *
 * Apple App Store Guideline 5.1.1(v): In-app account deletion zorunludur.
 * Bu uç noktayı yalnızca hesabını silmek isteyen oturum açmış kullanıcı
 * çağırabilir. Kullanıcı kendi Firebase ID token'ını gönderir; sunucu
 * bu token'ı verify eder, ardından:
 *   1) Firestore `users/{uid}` dökümanını siler
 *   2) Firebase Auth hesabını siler
 *
 * Yorumlar/postlar/etkileşimler "kaldırılan kullanıcı" referansıyla
 * orphan kalır — kişisel veriler (e-posta, isim, biyografi, foto, oturum)
 * tamamen kaldırılır. Yasal saklama yükümlülüğü olan kayıtlar (örn.
 * fatura) bu rotanın kapsamı dışındadır.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') ?? ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const idToken = authHeader.slice(7).trim()
  if (!idToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminAuth = getAdminAuth()
  const adminDb = getAdminFirestore()

  // 1) Token'ı verify et — yenilenmiş token şart (eski oturumlardan tetiklenmesin)
  let uid: string
  let email: string | null
  try {
    // checkRevoked = true: cihazda oturum revoked ise token reddedilsin
    const decoded = await adminAuth.verifyIdToken(idToken, true)
    uid = decoded.uid
    email = decoded.email ?? null
  } catch (err) {
    console.error('[api/account/delete] token verify failed:', err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2) Firestore user dökümanını sil (varsa)
  let firestoreDeleted = false
  try {
    const userRef = adminDb.collection(Collections.USERS).doc(uid)
    const snap = await userRef.get()
    if (snap.exists) {
      await userRef.delete()
      firestoreDeleted = true
    }
  } catch (err) {
    console.error('[api/account/delete] firestore delete failed:', err)
    // Firestore silinemese bile Auth'u silmeye devam et — kullanıcı haklı olarak
    // hesabını kaldırmak istiyor. Manuel temizlik destek üzerinden yapılır.
  }

  // 3) Tüm aktif oturumları revoke et — diğer cihazlarda anında çıkış
  try {
    await adminAuth.revokeRefreshTokens(uid)
  } catch (err) {
    console.error('[api/account/delete] revoke tokens failed (non-fatal):', err)
  }

  // 4) Firebase Auth hesabını sil
  try {
    await adminAuth.deleteUser(uid)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Auth user zaten yoksa silinmiş kabul edelim (idempotent)
    if (!/no\s+user\s+record/i.test(message)) {
      console.error('[api/account/delete] auth delete failed:', err)
      return NextResponse.json(
        { error: 'Auth deletion failed', detail: message },
        { status: 500 }
      )
    }
  }

  console.info('[api/account/delete] account removed', {
    uid,
    email,
    firestoreDeleted,
  })

  const res = NextResponse.json({ ok: true, deleted: true }, { status: 200 })
  // CMS session cookie'sini de iptal et
  res.cookies.set('cms_session', '', { path: '/', maxAge: 0 })
  return res
}
