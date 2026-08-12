/**
 * One-shot / admin-safe: yayındaki YouTube RSS canlı/#Canlı/#shorts junk'ı arşivle.
 *
 * Dry-run (default):
 *   node scripts/archive-youtube-live-junk.mjs
 *
 * Apply:
 *   APPLY=1 node scripts/archive-youtube-live-junk.mjs
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
const APPLY = process.env.APPLY === '1'

const LIVE_RE =
  /#\s*canl[ıi]|#\s*shorts?\b|canl[ıi]\s*yay[ıi]n|açıklama\s+yapıyor|konuşuyor|basın\s+toplantısı\s+(?:düzenliyor|yapıyor)/i

async function main() {
  const snap = await db
    .collection('news')
    .where('status', '==', 'published')
    .orderBy('publishedAt', 'desc')
    .limit(500)
    .get()
    .catch(async () =>
      db.collection('news').where('status', '==', 'published').limit(500).get()
    )

  let matched = 0
  let updated = 0

  for (const doc of snap.docs) {
    const data = doc.data()
    const title = String(data.title || '')
    const fp = String(data.rssFingerprint || '')
    const source = String(data.source || '')
    const isYt =
      fp.startsWith('youtube-rss:') ||
      source.toLowerCase() === 'youtube' ||
      String(data.slug || '').startsWith('video-')

    if (!isYt && !LIVE_RE.test(title)) continue
    if (!LIVE_RE.test(title) && !fp.startsWith('youtube-rss:')) continue
    if (!LIVE_RE.test(title)) continue

    matched++
    console.log(`${APPLY ? 'ARCHIVE' : 'DRY'} ${doc.id} | ${title.slice(0, 90)}`)

    if (APPLY) {
      await doc.ref.update({
        status: 'archived',
        featured: false,
        isEditorPick: false,
        featuredAt: null,
        moderationNote: 'YouTube canlı/#Canlı/#shorts — otomatik arşiv (video-only junk)',
        archivedReason: 'youtube_live_broadcast_filter',
        updatedAt: Date.now(),
      })
      updated++
    }
  }

  console.log(`\nMatched: ${matched}, Updated: ${updated}, APPLY=${APPLY}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
