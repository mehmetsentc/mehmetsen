/**
 * One-shot / admin-safe: yayındaki canlı/#Canlı/#shorts junk'ı arşivle.
 * Özellikle YouTube RSS + yanlışlıkla Teknoloji'ye düşmüş canlı yayınlar.
 *
 * Dry-run (default):
 *   node scripts/archive-youtube-live-junk.mjs
 *
 * Apply:
 *   APPLY=1 node scripts/archive-youtube-live-junk.mjs
 *
 * Optional:
 *   PAGE_SIZE=200 MAX_PAGES=50 node scripts/archive-youtube-live-junk.mjs
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
const PAGE_SIZE = Math.min(500, Math.max(50, Number(process.env.PAGE_SIZE || 200) || 200))
const MAX_PAGES = Math.min(200, Math.max(1, Number(process.env.MAX_PAGES || 50) || 50))

/**
 * Güçlü junk sinyali — gerçek "canlı yayın özelliği" haberlerini yakalamaz.
 * Başlık odaklı (#Canlı, #shorts, açıklama yapıyor, basın toplantısı düzenliyor…).
 */
function titleIsLiveJunk(title) {
  const t = String(title || '').toLowerCase().trim()
  if (!t) return false

  // Hashtag / shorts — kesin junk
  if (/#\s*canl[ıi]\b/.test(t)) return true
  if (/#\s*shorts?\b/.test(t)) return true
  if (/#\s*canl[ıi]yay[ıi]n\b/.test(t)) return true
  if (t.includes('#ankacanlı') || t.includes('ankacanlı')) return true

  // Canlı yayın / takip / anlatım (başlıkta — ürün haberi değil, yayın duyurusu)
  if (
    /\bcanl[ıi]\s*yay[ıi]n\b/.test(t) ||
    /\bcanl[ıi]\s*takip\b/.test(t) ||
    /\bcanl[ıi]\s*anlat[ıi]m\b/.test(t) ||
    /\bcanl[ıi]\s*blog\b/.test(t) ||
    /\bcanl[ıi]\s*izle(?:yin)?\b/.test(t)
  ) {
    // "canlı yayınında tartışma", "canlı yayında gözyaşları" = gerçek haber → hariç
    if (/\bcanl[ıi]\s*yay[ıi]n[ıi]nda\b/.test(t) || /\bcanl[ıi]\s*yay[ıi]nda\b/.test(t)) {
      return false
    }
    // "canlı yayın özelliği/servisi/fonksiyonu" = ürün haberi
    if (/\bcanl[ıi]\s*yay[ıi]n\s+(özelliği|özelligi|servisi|fonksiyonu|özelliğini)/.test(t)) {
      return false
    }
    return true
  }

  // Devam eden etkinlik — şimdiki zaman
  if (
    (t.includes('basın toplantısı') || t.includes('basin toplantisi')) &&
    (t.includes('düzenliyor') ||
      t.includes('düzenleniyor') ||
      t.includes('yapıyor') ||
      t.includes('yapılıyor') ||
      t.includes('gerçekleştiriyor') ||
      t.includes('gerçekleştiriliyor') ||
      t.includes('veriyor') ||
      t.includes('veriliyor'))
  ) {
    return true
  }

  if (
    t.includes('açıklama yapıyor') ||
    t.includes('açıklama yapılıyor') ||
    t.includes('konuşma yapıyor') ||
    (t.includes('konuşuyor') && (t.includes('canlı') || t.includes('#') || t.includes('basın')))
  ) {
    return true
  }

  if ((t.includes('düzenleniyor') || t.includes('düzenliyor')) && t.includes('canlı')) return true

  // Başlık canlı ile bitiyor / başlıyor + yayın bağlamı
  if (t.includes('canlı') && (t.endsWith('#canlı') || t.endsWith('# canlı') || t.startsWith('canlı '))) {
    return true
  }

  return false
}

/** YouTube gövdesinde ek sinyaller (sadece yt kaynak için) */
function youtubeBodyIsLiveJunk(body) {
  const c = String(body || '').toLowerCase()
  if (c.includes('youtube.com/live')) return true
  if (c.includes('#canlı') || c.includes('#canli') || c.includes('#shorts')) return true
  if (c.includes('canlı yayın') || c.includes('canli yayin')) return true
  return false
}

function isYoutubeish(data) {
  const fp = String(data.rssFingerprint || '')
  const source = String(data.source || '').toLowerCase()
  const slug = String(data.slug || '')
  const url = String(data.url || data.link || data.sourceUrl || '').toLowerCase()
  return (
    fp.startsWith('youtube-rss:') ||
    source === 'youtube' ||
    source.includes('youtube') ||
    slug.startsWith('video-') ||
    url.includes('youtube.com/') ||
    url.includes('youtu.be/')
  )
}

function categoryIdOf(data) {
  return String(data.categoryId || data.category || '')
    .toLowerCase()
    .trim()
}

function bodyOf(data) {
  return [data.summary, data.description, data.content, data.body, data.originalContent]
    .map((x) => String(x || ''))
    .join('\n')
}

async function fetchPublishedPage(cursor) {
  let q = db
    .collection('news')
    .where('status', '==', 'published')
    .orderBy('publishedAt', 'desc')
    .limit(PAGE_SIZE)
  if (cursor) q = q.startAfter(cursor)
  try {
    return await q.get()
  } catch {
    let q2 = db.collection('news').where('status', '==', 'published').limit(PAGE_SIZE)
    if (cursor) q2 = q2.startAfter(cursor)
    return await q2.get()
  }
}

function shouldArchive(data) {
  const title = String(data.title || '')
  const body = bodyOf(data)
  const yt = isYoutubeish(data)
  const cat = categoryIdOf(data)
  const titleJunk = titleIsLiveJunk(title)

  // 1) Başlıkta güçlü junk → YouTube veya teknoloji (yanlış desk) veya herhangi kategori + hashtag
  if (titleJunk) {
    const hasHashtag = /#\s*(canl[ıi]|shorts?)\b/i.test(title)
    if (yt || cat === 'teknoloji' || hasHashtag) return { ok: true, yt, cat, via: 'title' }
  }

  // 2) YouTube + gövdede canlı/#Canlı/#shorts (başlık kısaysa)
  if (yt && youtubeBodyIsLiveJunk(body)) {
    return { ok: true, yt, cat, via: 'yt-body' }
  }

  return { ok: false, yt, cat, via: null }
}

async function main() {
  let matched = 0
  let updated = 0
  let scanned = 0
  let cursor = null

  for (let page = 0; page < MAX_PAGES; page++) {
    const snap = await fetchPublishedPage(cursor)
    if (snap.empty) break
    scanned += snap.size
    cursor = snap.docs[snap.docs.length - 1]

    for (const doc of snap.docs) {
      const data = doc.data()
      const title = String(data.title || '')
      const decision = shouldArchive(data)
      if (!decision.ok) continue

      matched++
      console.log(
        `${APPLY ? 'ARCHIVE' : 'DRY'} ${doc.id} | cat=${decision.cat || '-'} | yt=${decision.yt ? 1 : 0} | via=${decision.via} | ${title.slice(0, 100)}`
      )

      if (APPLY) {
        await doc.ref.update({
          status: 'archived',
          featured: false,
          isEditorPick: false,
          featuredAt: null,
          moderationNote: 'Canlı/#Canlı/#shorts junk — otomatik arşiv (YouTube/live filter)',
          archivedReason: 'youtube_live_broadcast_filter',
          updatedAt: Date.now(),
        })
        updated++
      }
    }

    if (snap.size < PAGE_SIZE) break
  }

  console.log(`\nScanned: ${scanned}, Matched: ${matched}, Updated: ${updated}, APPLY=${APPLY}`)
  console.log(`Pages max=${MAX_PAGES}, pageSize=${PAGE_SIZE}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
