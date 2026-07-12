import { readFileSync } from 'fs'
import { backfillArticleSeo } from '../src/lib/seoBackfill.ts'
import { submitIndexNowUrls, buildNewsIndexNowUrl } from '../src/lib/indexNow.ts'
import { pingSitemaps } from '../src/lib/seo.ts'
import { getAdminFirestore } from '../src/lib/firebase/admin.ts'
import { Collections } from '../src/lib/firebase/collections.ts'

try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m || process.env[m[1]]) continue
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[m[1]] = val.replace(/\\n/g, '\n')
  }
} catch {
  // ignore
}

const limit = Number(process.argv[2] || 40)
console.log(`SEO backfill başlıyor (limit=${limit})...`)
const result = await backfillArticleSeo(limit)
console.log(JSON.stringify(result, null, 2))

const indexNowLimit = Number(process.argv[3] || 25)
console.log(`IndexNow ping başlıyor (limit=${indexNowLimit})...`)
try {
  const snap = await getAdminFirestore()
    .collection(Collections.NEWS)
    .where('status', '==', 'published')
    .orderBy('publishedAt', 'desc')
    .select('slug')
    .limit(indexNowLimit)
    .get()

  const urls = snap.docs
    .map((doc) => {
      const slug = doc.data().slug?.trim()
      return slug ? buildNewsIndexNowUrl(slug) : null
    })
    .filter(Boolean)

  await Promise.allSettled([submitIndexNowUrls(urls), pingSitemaps()])
  console.log(JSON.stringify({ indexNowUrls: urls.length }, null, 2))
} catch (err) {
  console.error('[indexnow]', err)
}
