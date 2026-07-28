#!/usr/bin/env node
/**
 * Kısa içerik genişletme — thinContentBackfillWorker sarmalayıcı.
 * Env: THIN_BACKFILL_MIN_WORDS, THIN_BACKFILL_MAX_PER_RUN, THIN_BACKFILL_SCAN_LIMIT
 */
import { readFileSync } from 'fs'
import { loadEnvFile } from './newsroom-shared.mjs'

loadEnvFile('.env.local')
loadEnvFile('.env')

// Legacy .env.local parse fallback (private key multiline)
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

const min = process.argv.find((a) => a.startsWith('--min-words='))?.split('=')[1]
const max = process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1]
if (min) process.env.THIN_BACKFILL_MIN_WORDS = min
if (max) process.env.THIN_BACKFILL_MAX_PER_RUN = max

console.log('Thin content backfill başlıyor...', {
  minWords: process.env.THIN_BACKFILL_MIN_WORDS || 220,
  maxPerRun: process.env.THIN_BACKFILL_MAX_PER_RUN || 8,
})

const { runThinContentBackfillWorker } = await import(
  '../src/services/newsroom/thinContentBackfillWorker.ts'
)
const result = await runThinContentBackfillWorker()
console.log(JSON.stringify(result, null, 2))
