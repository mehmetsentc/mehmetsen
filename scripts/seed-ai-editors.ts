/**
 * One-shot: seed 8 default AI editors (idempotent).
 * Usage: npx tsx scripts/seed-ai-editors.ts
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function loadEnvFile(filename: string) {
  const path = join(process.cwd(), filename)
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
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

loadEnvFile('.env.local')

async function main() {
  const { seedDefaultAiEditors } = await import('../src/lib/ai/editorial/aiEditorService')
  const result = await seedDefaultAiEditors('system-cli')
  console.log(JSON.stringify({ success: true, ...result }, null, 2))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
