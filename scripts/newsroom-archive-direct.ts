/**
 * Local CLI entry: run archive backfill without HTTP (Firebase Admin SDK).
 */
import { archiveEditor } from '../src/services/newsroom/archiveEditor'

function readArg(name: string, fallback: string): string {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : fallback
}

async function main() {
  const days = Number(readArg('days', '90'))
  const maxAiCalls = Number(readArg('maxAiCalls', readArg('max-ai', '5')))

  const result = await archiveEditor.run({
    days: Number.isFinite(days) ? days : 90,
    maxAiCalls: Number.isFinite(maxAiCalls) ? maxAiCalls : 5,
  })

  console.log('Archive complete:', JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error('Archive failed:', error)
  process.exit(1)
})
