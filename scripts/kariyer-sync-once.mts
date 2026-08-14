import { syncKariyerJobListings } from '../src/services/kariyerJobListingSyncService.ts'

async function main() {
  const r = await syncKariyerJobListings()
  console.log(JSON.stringify(r, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
