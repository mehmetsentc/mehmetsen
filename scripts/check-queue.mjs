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

// Son 10 newsQueue item
const q = await db.collection('newsQueue').orderBy('createdAt', 'desc').limit(10).get()
console.log(`\n=== newsQueue (${q.size} item) ===`)
q.docs.forEach(d => {
  const data = d.data()
  console.log(`  [${d.id}] status=${data.status} title="${data.input?.originalTitle?.slice(0,60)}"`)
})

// Son 5 news item
const n = await db.collection('news').orderBy('publishedAt', 'desc').limit(5).get()
console.log(`\n=== news (son 5) ===`)
n.docs.forEach(d => {
  const data = d.data()
  const date = data.publishedAt?.toDate?.() ?? new Date(data.publishedAt)
  console.log(`  [${d.id.slice(0,8)}] ${date.toISOString().slice(0,16)} "${data.title?.slice(0,60)}"`)
})

// newsQueue'daki published item'ların newsId'leri
console.log(`\n=== newsQueue published newsIds ===`)
const qp = await db.collection('newsQueue').where('status','==','published').limit(5).get()
qp.docs.forEach(d => {
  const data = d.data()
  console.log(`  newsId=${data.newsId} title="${data.input?.originalTitle?.slice(0,50)}"`)
})
