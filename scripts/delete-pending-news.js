#!/usr/bin/env node
/**
 * delete-pending-news.js
 *
 * Admin panelde "Onay Bekliyor" görünen haberleri siler:
 *   - newsDrafts[draftStatus=pending_review]
 *   - news[status=pending]  (varsa)
 *
 * Kullanım: node scripts/delete-pending-news.js
 */

const fs   = require('fs')
const path = require('path')

// .env.local'ı manuel oku
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
}

const { initializeApp, cert, getApps } = require('firebase-admin/app')
const { getFirestore }                  = require('firebase-admin/firestore')

const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
const privateKey  = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n')

if (!projectId || !clientEmail || !privateKey) {
  console.error('❌ FIREBASE_ADMIN_* env değişkenleri eksik (.env.local kontrol et)')
  process.exit(1)
}

if (!getApps().length) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
}
const db = getFirestore()

async function deleteWhere(collection, field, value) {
  const BATCH_SIZE = 100
  let total = 0, round = 0

  while (true) {
    round++
    const snap = await db.collection(collection).where(field, '==', value).limit(BATCH_SIZE).get()
    if (snap.empty) break

    const batch = db.batch()
    snap.docs.forEach(doc => {
      const d = doc.data()
      console.log(`  · [${collection}] ${doc.id} — ${(d.title || '').slice(0, 65)}`)
      batch.delete(doc.ref)
    })

    await batch.commit()
    total += snap.size
    console.log(`  ✅ Tur ${round}: ${snap.size} silindi\n`)
    if (snap.size < BATCH_SIZE) break
  }

  return total
}

async function main() {
  console.log('🗑️  Onay bekleyen haberler siliniyor…\n')

  const drafts = await deleteWhere('newsDrafts', 'draftStatus', 'pending_review')
  const news   = await deleteWhere('news',       'status',      'pending')

  console.log(`\n🏁 Tamamlandı.`)
  console.log(`   newsDrafts[pending_review] : ${drafts}`)
  console.log(`   news[pending]              : ${news}`)
  console.log(`   Toplam                     : ${drafts + news}`)
}

main().catch(err => {
  console.error('❌ Hata:', err.message)
  process.exit(1)
})
