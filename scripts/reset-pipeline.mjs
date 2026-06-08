/**
 * newsDrafts ve sourceFingerprints'i temizler.
 * Ardından breaking cron ile taze başlangıç yapılabilir.
 */
import { readFileSync } from 'fs'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const env = readFileSync('.env.local', 'utf8')
const get = (key) => env.match(new RegExp(`${key}=["']?([^"'\n]+)["']?`))?.[1] ?? ''
const privateKey = env.match(/FIREBASE_ADMIN_PRIVATE_KEY="([\s\S]+?)"(\s*\n|$)/)?.[1].replace(/\\n/g, '\n') ?? ''

if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: get('FIREBASE_ADMIN_PROJECT_ID'), clientEmail: get('FIREBASE_ADMIN_CLIENT_EMAIL'), privateKey }) })
}

const db = getFirestore()

async function deleteInBatches(colRef) {
  let total = 0
  while (true) {
    const snap = await colRef.limit(400).get()
    if (snap.empty) break
    const batch = db.batch()
    snap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
    total += snap.size
  }
  return total
}

// newsDrafts temizle
const drafts = await deleteInBatches(db.collection('newsDrafts'))
console.log(`newsDrafts: ${drafts} taslak silindi`)

// newsQueue - pending/processing olanları sil
const qSnap = await db.collection('newsQueue').where('status', 'in', ['pending','processing','failed']).get()
if (!qSnap.empty) {
  const batch = db.batch()
  qSnap.docs.forEach(d => batch.delete(d.ref))
  await batch.commit()
  console.log(`newsQueue: ${qSnap.size} item temizlendi`)
}

// Fingerprint'leri temizle
const SOURCE_IDS = ['cnn','bbc','reuters','trt','ntv','haberturk','aa','iha','dha','sozcu','hurriyet','t24']
let fpTotal = 0
for (const id of SOURCE_IDS) {
  const snap = await db.collection('sourceFingerprints').doc(id).collection('articles').get()
  if (snap.empty) continue
  const chunks = []
  for (let i = 0; i < snap.docs.length; i += 500) chunks.push(snap.docs.slice(i, i+500))
  for (const chunk of chunks) {
    const b = db.batch(); chunk.forEach(d => b.delete(d.ref)); await b.commit()
  }
  fpTotal += snap.size
  console.log(`  fingerprint ${id}: ${snap.size} silindi`)
}
console.log(`\nToplam fingerprint: ${fpTotal} silindi`)
console.log('\nHazır. Şimdi breaking cron tetikleyin.')
