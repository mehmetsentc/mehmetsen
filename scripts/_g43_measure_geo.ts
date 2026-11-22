/**
 * GÖREV 43 A1 — Firestore READ ONLY. .get() only; no writes.
 * Son yayımlanan haberlerde mevcut metin dedektörü (hintCategoryFromText) ve
 * locateSondakikaArticle, editörün kaydettiği il/ilçe/kategori ile karşılaştırılır.
 *   npx tsx --tsconfig tsconfig.json scripts/_g43_measure_geo.ts [N]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { hintCategoryFromText } from '../src/lib/ai/editorial/categoryHint'
import { locateSondakikaArticle } from '../src/services/crawler/sondakika/locate'

function loadEnv(p: string) {
  if (!existsSync(p)) return
  const t = readFileSync(p, 'utf8')
  const re = /^([A-Z0-9_]+)=(?:"((?:\\.|[^"\\])*)"|'([^']*)'|(.*))$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    const v = m[2] !== undefined ? m[2].replace(/\\n/g, '\n').replace(/\\"/g, '"') : (m[3] ?? m[4] ?? '').trim()
    if (process.env[m[1]] === undefined) process.env[m[1]] = v
  }
}
loadEnv('.env.local')
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  })
}
const strip = (s: unknown) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

async function main() {
  const N = Number(process.argv[2] || 600)
  const snap = await getFirestore().collection('news').where('status', '==', 'published')
    .orderBy('publishedAt', 'desc').limit(N).get()
  type Row = Record<string, unknown>
  const rows: Row[] = []
  for (const d of snap.docs) {
    const x = d.data()
    const title = strip(x.title), spot = strip(x.spot || x.summary), body = strip(x.content).slice(0, 4000)
    const city = String(x.citySlug || '').trim() || null
    const dist = String(x.districtSlug || '').trim() || null
    const cat = String(x.categoryId || '').trim() || null
    const hint = hintCategoryFromText(`${title}\n${spot}\n${body}`)
    const loc = locateSondakikaArticle({ title, description: spot, body })
    rows.push({
      id: d.id, cms: String(x.source || '') === 'NaHaber', ai: Boolean(x.aiEditorId),
      title: title.slice(0, 90), city, dist, cat,
      hintCity: hint?.citySlug ?? null, hintDist: hint?.districtSlug ?? null, hintCat: hint?.categoryId ?? null,
      locCity: loc.likelyNational ? null : loc.provinceSlug, locConf: loc.confidence, locNational: loc.likelyNational,
    })
  }
  const groups: Record<string, Row[]> = {
    'tümü': rows,
    'CMS (source=NaHaber)': rows.filter((r) => r.cms),
    'CMS + AI editör': rows.filter((r) => r.cms && r.ai),
  }
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-')
  for (const [name, g] of Object.entries(groups)) {
    const withCity = g.filter((r) => r.city)
    const hintOk = withCity.filter((r) => r.hintCity === r.city).length
    const locOk = withCity.filter((r) => r.locCity === r.city).length
    const hintWrong = withCity.filter((r) => r.hintCity && r.hintCity !== r.city).length
    const locWrong = withCity.filter((r) => r.locCity && r.locCity !== r.city).length
    const catOk = g.filter((r) => r.cat && r.hintCat === r.cat).length
    console.log(`\n## ${name}: ${g.length} haber, ili kayıtlı ${withCity.length}`)
    console.log(`  il — mevcut dedektör doğru ${pct(hintOk, withCity.length)}, farklı il ${pct(hintWrong, withCity.length)}`)
    console.log(`  il — locate doğru ${pct(locOk, withCity.length)}, farklı il ${pct(locWrong, withCity.length)}`)
    console.log(`  kategori — kural ipucu aynı ${pct(catOk, g.length)}`)
  }
  writeFileSync('/tmp/g43_geo_rows.json', JSON.stringify(rows, null, 1))
}
main().catch((e) => { console.error(String(e?.message || e).slice(0, 300)); process.exit(1) })
