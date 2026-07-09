import { readFileSync } from 'fs'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.replace(/^["']|["']$/g, '') ?? ''
const pk = env.match(/FIREBASE_ADMIN_PRIVATE_KEY="([\s\S]+?)"(\s*\n|$)/)?.[1]?.replace(/\\n/g, '\n') ?? ''
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: get('FIREBASE_ADMIN_PROJECT_ID'),
      clientEmail: get('FIREBASE_ADMIN_CLIENT_EMAIL'),
      privateKey: pk,
    }),
  })
}
const db = getFirestore()

const slug = process.argv[2] || 'is-arkadasindan-16-dakikalik-olum-tuzagi'
const snap = await db.collection('news').where('slug', '==', slug).limit(1).get()
const doc = snap.docs[0]
if (!doc) {
  console.log('not found')
  process.exit(0)
}
const d = doc.data()
console.log('id:', doc.id)
for (const k of ['spot', 'summary', 'description', 'content', 'htmlContent']) {
  const v = String(d[k] ?? '')
  console.log(`\n${k} len:`, v.length)
  console.log(`${k} preview:`, v.slice(0, 200).replace(/\n/g, ' '))
}
