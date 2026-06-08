/**
 * Local CLI entry: run event sync without HTTP (Firebase Admin SDK).
 * Invoked by scripts/sync-events.mjs in direct mode.
 */
import { eventSyncService } from '../src/services/eventSyncService'

async function main() {
  const result = await eventSyncService.syncEvents()
  console.log('Sync complete:', JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error('Sync failed:', error)
  process.exit(1)
})
