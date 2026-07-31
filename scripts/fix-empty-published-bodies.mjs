/**
 * One-shot: yayında ama spot/description/content boş (özellikle video-*) haberleri düzelt.
 *
 * Usage:
 *   node scripts/fix-empty-published-bodies.mjs
 *
 * Requires FIREBASE_ADMIN_* in .env.local
 */
import { createRequire } from 'module'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const require = createRequire(import.meta.url)

function loadEnv() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[m[1].trim()]) process.env[m[1].trim()] = v
  }
}

loadEnv()

const admin = require('firebase-admin')
if (!admin.apps.length) {
  let pk = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: pk,
    }),
  })
}

const db = admin.firestore()

function bodyWords(data) {
  const t = [data.description, data.content, data.spot]
    .map((x) => String(x || '').trim())
    .join(' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return 0
  return t.split(/\s+/).filter(Boolean).length
}

async function main() {
  const snap = await db
    .collection('news')
    .where('status', '==', 'published')
    .orderBy('publishedAt', 'desc')
    .limit(400)
    .get()
    .catch(async () =>
      db.collection('news').where('status', '==', 'published').limit(400).get()
    )

  let filled = 0
  let drafted = 0
  let skipped = 0

  for (const doc of snap.docs) {
    const data = doc.data()
    const words = bodyWords(data)
    if (words >= 40) {
      skipped++
      continue
    }

    const title = String(data.title || '').trim()
    if (!title) {
      skipped++
      continue
    }

    const isVideo =
      data.postType === 'video' ||
      String(data.slug || '').startsWith('video-') ||
      String(data.rssFingerprint || '').startsWith('youtube-rss:')

    const summary = String(data.summary || '').trim()
    const sourceUrl = String(data.sourceUrl || data.videoEmbedUrl || '').trim()
    const now = Date.now()

    if (isVideo || words < 10) {
      const spot =
        summary.length >= 40
          ? summary.slice(0, 280)
          : `${title.replace(/\s*#Canlı\s*$/i, '').trim()}.`
      const body = [
        spot,
        '',
        summary.length > spot.length ? summary : '',
        '',
        sourceUrl ? `Video: ${sourceUrl}` : '',
        '',
        'Bu içerik otomatik alındı; ayrıntılar kaynak videoda.',
      ]
        .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
        .join('\n')
        .trim()

      // Özeti de zayıfsa yayından çek
      if (summary.length < 40 && isVideo) {
        await doc.ref.update({
          status: 'draft',
          featured: false,
          isEditorPick: false,
          featuredAt: null,
          moderationNote: 'Boş içerik (spot/gövde yok) — otomatik taslak',
          updatedAt: now,
        })
        drafted++
        console.log('draft', doc.id, String(data.slug || '').slice(0, 40))
      } else {
        await doc.ref.update({
          spot,
          description: body,
          content: body,
          summary: summary || title.slice(0, 280),
          emptyBodyFixedAt: now,
          updatedAt: now,
        })
        filled++
        console.log('filled', doc.id, String(data.slug || '').slice(0, 40))
      }
    } else {
      skipped++
    }
  }

  console.log(JSON.stringify({ scanned: snap.size, filled, drafted, skipped }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
