import { Collections, getAdminFirestore } from '../src/lib/firebase/admin.ts'
import { getCityJobListingsServer } from '../src/services/jobListingService.server.ts'

async function tryQ(label: string, run: () => Promise<{ size: number }>) {
  try {
    const snap = await run()
    console.log(label, 'ok count=', snap.size)
  } catch (e) {
    console.log(label, 'FAIL', e instanceof Error ? e.message.slice(0, 240) : e)
  }
}

async function main() {
  const db = getAdminFirestore()
  const city = 'canakkale'
  const col = db.collection(Collections.JOB_LISTINGS)

  await tryQ('eq-only', () =>
    col.where('citySlug', '==', city).where('isActive', '==', true).limit(5).get()
  )
  await tryQ('order-fetchedAt', () =>
    col
      .where('citySlug', '==', city)
      .where('isActive', '==', true)
      .orderBy('fetchedAt', 'desc')
      .limit(5)
      .get()
  )
  await tryQ('order-deadlineAt', () =>
    col
      .where('citySlug', '==', city)
      .where('isActive', '==', true)
      .orderBy('deadlineAt', 'asc')
      .limit(5)
      .get()
  )

  const list = await getCityJobListingsServer(city)
  console.log('getCityJobListingsServer=', list.length, list[0]?.title ?? null)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
