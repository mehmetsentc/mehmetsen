/**
 * Clears all sourceFingerprints from Firestore so the newsroom
 * workers treat all current RSS articles as new.
 *
 * Usage: node scripts/clear-fingerprints.mjs
 */
import { readFileSync } from 'fs'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const env = readFileSync('.env.local', 'utf8')
const get = (key) => {
  const m = env.match(new RegExp(`${key}=["']?([^"'\n]+)["']?`))
  return m?.[1] ?? ''
}

const privateKey = (() => {
  const m = env.match(/FIREBASE_ADMIN_PRIVATE_KEY="([\s\S]+?)"(\s*\n|$)/)
  return m?.[1].replace(/\\n/g, '\n') ?? ''
})()

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: get('FIREBASE_ADMIN_PROJECT_ID'),
      clientEmail: get('FIREBASE_ADMIN_CLIENT_EMAIL'),
      privateKey,
    }),
  })
}

const db = getFirestore()

async function deleteCollection(colRef) {
  const snap = await colRef.get()
  if (snap.empty) return 0
  const batch = db.batch()
  snap.docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()
  return snap.size
}

// Tüm bilinen kaynak ID'leri — parent doc olmasa da subcollection'ı doğrudan sorgula
const ALL_SOURCE_IDS = [
  'cnn', 'bbc', 'reuters', 'trt', 'ntv', 'haberturk',
  'aa', 'iha', 'dha', 'sozcu', 'hurriyet', 't24',
  'portal-haberler', 'yerel-haberler',
]

async function main() {
  let total = 0

  for (const sourceId of ALL_SOURCE_IDS) {
    const articlesRef = db.collection('sourceFingerprints').doc(sourceId).collection('articles')
    const snap = await articlesRef.get()
    if (snap.empty) {
      console.log(`  ${sourceId}: boş`)
      continue
    }
    // Firestore batch max 500
    const chunks = []
    for (let i = 0; i < snap.docs.length; i += 500) chunks.push(snap.docs.slice(i, i + 500))
    for (const chunk of chunks) {
      const batch = db.batch()
      chunk.forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
    console.log(`  ${sourceId}: ${snap.size} fingerprint silindi`)
    total += snap.size
  }

  if (total === 0) {
    console.log('Hiç fingerprint bulunamadı — koleksiyon zaten temiz.')
  } else {
    console.log(`\nToplam ${total} fingerprint temizlendi. Artık tüm haberler "yeni" sayılacak.`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
