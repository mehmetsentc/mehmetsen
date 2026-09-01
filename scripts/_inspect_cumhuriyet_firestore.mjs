import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getAdminFirestore } from '@/lib/firebase/admin'

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  try {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const i = line.indexOf('=')
      const k = line.slice(0, i).trim()
      let v = line.slice(i + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (!(k in process.env)) process.env[k] = v
    }
  } catch (e) {}
}

loadEnvLocal()

async function main() {
  const db = getAdminFirestore()
  const snap = await db.collection('news').where('ingestionSourceId', '==', 'src_19c71d72-1664-4f37-9ab1-f90847a6f4e1').limit(10).get()
  console.log(`Firestore items for Cumhuriyet source: ${snap.docs.length}`)
  for (const doc of snap.docs) {
    const d = doc.data()
    console.log(`ID: ${doc.id}, Title: ${d.title}, Status: ${d.status}, Slug: ${d.slug}`)
  }
}

main().catch(console.error)
