/**
 * One-shot: promote SUPER_ADMIN_EMAIL to super_admin in Firestore.
 * Usage: node --env-file=.env.local --import tsx scripts/promote-super-admin.ts
 */
import type { DocumentSnapshot } from 'firebase-admin/firestore'

async function main() {
  const email = (process.env.SUPER_ADMIN_EMAIL || 'mehmetsentc@gmail.com').trim().toLowerCase()
  const bootstrapUid = (process.env.NEXT_PUBLIC_ADMIN_UIDS || process.env.ADMIN_BOOTSTRAP_UIDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)[0]

  const { getAdminFirestore } = await import('../src/lib/firebase/admin')
  const db = getAdminFirestore()

  const byEmail = await db.collection('users').where('email', '==', email).limit(5).get()
  let docs: DocumentSnapshot[] = byEmail.docs

  if (docs.length === 0) {
    const mixed = await db.collection('users').where('email', '==', 'mehmetsentc@gmail.com').limit(5).get()
    docs = mixed.docs
  }

  if (docs.length === 0 && bootstrapUid) {
    const byUid = await db.collection('users').doc(bootstrapUid).get()
    if (byUid.exists) docs = [byUid]
  }

  if (docs.length === 0) {
    console.error(`No users doc found for ${email}`)
    process.exit(1)
  }

  for (const doc of docs) {
    const data = doc.data()!
    const prev = data.role
    await doc.ref.update({
      role: 'super_admin',
      updatedAt: new Date().toISOString(),
    })
    console.log(`OK uid=${doc.id} email=${data.email} role: ${prev} → super_admin`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
