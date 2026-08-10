import { paribuCineverseSyncService } from '@/services/paribuCineverseSyncService'

async function main() {
  const result = await paribuCineverseSyncService.syncCanakkale()
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
