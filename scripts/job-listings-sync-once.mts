import { syncAllJobListings } from '../src/services/jobListingsOrchestrator.ts'

async function main() {
  const r = await syncAllJobListings()
  console.log(JSON.stringify(r, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
