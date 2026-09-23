import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function loadEnvFile(filename: string) {
  const path = join(process.cwd(), filename)
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

async function main() {
  loadEnvFile('.env.local')
  const { getAiEditorBySlug } = await import('../src/lib/ai/editorial/aiEditorService')

  const slugsToCheck = [
    'defne-aksoy',
    'yerel-canakkale',
    'nisa-korhan',
    'tarik-akbay',
    'lara-kumral',
    'ulke-es',
    'yerel-ilce-canakkale-biga',
  ]

  const results: Record<string, unknown>[] = []
  for (const slug of slugsToCheck) {
    const editor = await getAiEditorBySlug(slug)
    results.push({ slug, exists: !!editor, id: editor?.id ?? null })
  }
  console.log(JSON.stringify({ success: true, results }, null, 2))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err)
  process.exit(1)
})
