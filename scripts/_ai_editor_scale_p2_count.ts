import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

for (const path of [join(process.cwd(), '.env.local'), '/Users/user/nahaber/.env.local']) {
  if (!existsSync(path)) continue
  const text = readFileSync(path, 'utf8')
  let i = 0
  while (i < text.length) {
    if (text[i] === '#' || text[i] === '\n') {
      const nl = text.indexOf('\n', i)
      i = nl === -1 ? text.length : nl + 1
      continue
    }
    const eq = text.indexOf('=', i)
    if (eq === -1) break
    const key = text.slice(i, eq).trim()
    if (!key || key.includes('\n')) {
      const nl = text.indexOf('\n', i)
      i = nl === -1 ? text.length : nl + 1
      continue
    }
    let j = eq + 1
    let value = ''
    if (text[j] === '"' || text[j] === "'") {
      const q = text[j]!
      j += 1
      while (j < text.length) {
        if (text[j] === '\\' && j + 1 < text.length) {
          const n = text[j + 1]!
          value += n === 'n' ? '\n' : n === 't' ? '\t' : n === q ? q : n
          j += 2
          continue
        }
        if (text[j] === q) {
          j += 1
          break
        }
        value += text[j]
        j += 1
      }
    } else {
      const nl = text.indexOf('\n', j)
      const end = nl === -1 ? text.length : nl
      value = text.slice(j, end).trim()
      j = end
    }
    if (process.env[key] === undefined) process.env[key] = value
    const nl = text.indexOf('\n', j)
    i = nl === -1 ? text.length : nl + 1
  }
}

async function main() {
  const sa = {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!.trim(),
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!.trim(),
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n').trim(),
  }
  if (!getApps().length) initializeApp({ credential: cert(sa), projectId: sa.projectId })
  const db = getFirestore()
  const n = await db.collection('aiEditors').count().get()
  const cb = await db.collection('aiEditorialConfig').doc('circuitBreaker').get()
  const w0 = await db.collection('aiEditors').doc('ai_editor_yigit-anafarta').get()
  const w1 = await db.collection('aiEditors').doc('ai_editor_il-bursa-spor').get()
  const w2 = await db.collection('aiEditors').doc('ai_editor_ilce-canakkale-biga').get()
  const w3 = await db.collection('aiEditors').doc('ai_editor_ulke-ispanya').get()
  console.log(
    JSON.stringify({
      editors: n.data().count,
      circuit: cb.exists ? cb.data() : null,
      yigit: w0.exists,
      bursaSpor: w1.exists,
      biga: w2.exists,
      ispanya: w3.exists,
      yigitScale: w0.exists ? (w0.data() as { scaleHardened?: boolean }).scaleHardened : null,
    })
  )
}

void main()

