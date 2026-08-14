import { Collections, getAdminFirestore } from '../src/lib/firebase/admin.ts'

async function main() {
  const db = getAdminFirestore()
  const all = await db
    .collection(Collections.JOB_LISTINGS)
    .where('citySlug', '==', 'canakkale')
    .where('isActive', '==', true)
    .get()

  const bySource: Record<string, number> = {}
  const sample: Array<Record<string, unknown>> = []

  for (const d of all.docs) {
    const x = d.data()
    const s = String(x.source || '?')
    bySource[s] = (bySource[s] || 0) + 1
    if (sample.length < 5) {
      sample.push({
        id: d.id,
        source: x.source,
        title: x.title,
        employer: x.employer,
        locationLabel: x.locationLabel,
        applyUrl: typeof x.applyUrl === 'string' ? x.applyUrl.slice(0, 90) : null,
      })
    }
  }

  console.log(JSON.stringify({ activeTotal: all.size, bySource, sample }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
