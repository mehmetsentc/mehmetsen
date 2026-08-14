import { syncIskurJobListings } from '../src/services/jobListingSyncService.ts'
async function main() {
  const r = await syncIskurJobListings()
  console.log(JSON.stringify(r, null, 2))
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
