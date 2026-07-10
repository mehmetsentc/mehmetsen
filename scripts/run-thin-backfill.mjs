import { readFileSync } from 'fs'
import { runThinContentBackfillWorker } from '../src/services/newsroom/thinContentBackfillWorker.ts'

// Load .env.local for Firebase admin credentials
try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m || process.env[m[1]]) continue
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[m[1]] = val.replace(/\\n/g, '\n')
  }
} catch {
  // ignore
}

console.log('Thin content backfill başlıyor...')
const result = await runThinContentBackfillWorker()
console.log(JSON.stringify(result, null, 2))
