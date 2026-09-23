/**
 * SCALE P2.2 post-deploy GET-only watch.
 *   npx tsx --tsconfig tsconfig.json scripts/_ai_editor_scale_p2_2_watch.ts
 */
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

type EditorRow = {
  slug?: string
  scaleHardened?: boolean
  publishPolicy?: string
  maxDailyNews?: number
  consecutiveQualityGatePasses?: number
  autoPublishUnlockThreshold?: number
  scaleDailyNewsCount?: number
}

function sample(data: EditorRow | undefined) {
  if (!data) return null
  return {
    slug: data.slug,
    scaleHardened: data.scaleHardened === true,
    publishPolicy: data.publishPolicy ?? null,
    maxDailyNews: data.maxDailyNews ?? null,
    consecutiveQualityGatePasses: data.consecutiveQualityGatePasses ?? 0,
    autoPublishUnlockThreshold: data.autoPublishUnlockThreshold ?? null,
    scaleDailyNewsCount: data.scaleDailyNewsCount ?? 0,
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
  const since = Date.now() - 3 * 60 * 60 * 1000
  const [n, cb, yigit, bursa, biga, ispanya, defne, usage] = await Promise.all([
    db.collection('aiEditors').count().get(),
    db.collection('aiEditorialConfig').doc('circuitBreaker').get(),
    db.collection('aiEditors').doc('ai_editor_yigit-anafarta').get(),
    db.collection('aiEditors').doc('ai_editor_il-bursa-spor').get(),
    db.collection('aiEditors').doc('ai_editor_ilce-canakkale-biga').get(),
    db.collection('aiEditors').doc('ai_editor_ulke-ispanya').get(),
    db.collection('aiEditors').doc('ai_editor_defne-aksoy').get(),
    db.collection('aiUsageEvents').where('createdAt', '>=', since).select('success').limit(500).get(),
  ])
  let usageErrorCount = 0
  for (const d of usage.docs) {
    if ((d.data() as { success?: boolean }).success === false) usageErrorCount += 1
  }
  console.log(
    JSON.stringify(
      {
        editors: n.data().count,
        circuit: cb.exists ? cb.data() : null,
        usageSample: usage.size,
        usageErrorCount,
        usageErrorRate: usage.size ? usageErrorCount / usage.size : null,
        samples: {
          yigit: sample(yigit.data() as EditorRow),
          bursaSpor: sample(bursa.data() as EditorRow),
          biga: sample(biga.data() as EditorRow),
          ispanya: sample(ispanya.data() as EditorRow),
          defne: sample(defne.data() as EditorRow),
        },
      },
      null,
      2
    )
  )
}

void main()
