/**
 * P11.2R-RUNTIME — invoke Production R2 diagnostic (sanitized JSON only).
 * Uses temp Vercel env pull; never prints secret values.
 *
 * Usage: npx tsx scripts/_invoke_p11_2r_runtime.mts
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const APP_URL = 'https://www.nahaber.com'
const OUT = resolve(process.cwd(), 'scripts/_phase_p11_2r_runtime-report.json')

function parseEnv(raw: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    map[k] = v
  }
  return map
}

function main() {
  const tmp = mkdtempSync(join(tmpdir(), 'p112r-'))
  const envFile = join(tmp, 'prod.env')
  try {
    execFileSync('npx', ['vercel', 'env', 'pull', envFile, '--environment', 'production', '--yes'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'ignore', 'pipe'],
      encoding: 'utf8',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    writeFileSync(OUT, JSON.stringify({ ok: false, error: 'ENV_PULL_FAILED', detail: msg.slice(0, 120) }, null, 2))
    console.log(JSON.stringify({ ok: false, error: 'ENV_PULL_FAILED' }))
    process.exit(1)
  }

  const env = parseEnv(readFileSync(envFile, 'utf8'))
  const secret = (
    env.CRON_SECRET ||
    env.NEWSROOM_CRON_SECRET ||
    env.EVENTS_SYNC_SECRET ||
    ''
  ).trim()

  if (!secret) {
    writeFileSync(
      OUT,
      JSON.stringify({ ok: false, error: 'NO_CRON_SECRET_FOR_INVOKE' }, null, 2)
    )
    console.log(JSON.stringify({ ok: false, error: 'NO_CRON_SECRET_FOR_INVOKE' }))
    rmSync(tmp, { recursive: true, force: true })
    process.exit(2)
  }

  let body = ''
  try {
    body = execFileSync(
      'curl',
      [
        '-sS',
        '--max-time',
        '90',
        `${APP_URL}/api/internal/pilot/r2-health?token=${encodeURIComponent(secret)}`,
      ],
      { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    writeFileSync(OUT, JSON.stringify({ ok: false, error: 'INVOKE_FAILED', detail: msg.slice(0, 120) }, null, 2))
    console.log(JSON.stringify({ ok: false, error: 'INVOKE_FAILED' }))
    rmSync(tmp, { recursive: true, force: true })
    process.exit(1)
  }

  rmSync(tmp, { recursive: true, force: true })

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    writeFileSync(
      OUT,
      JSON.stringify({ ok: false, error: 'INVALID_JSON_RESPONSE', rawLength: body.length }, null, 2)
    )
    console.log(JSON.stringify({ ok: false, error: 'INVALID_JSON_RESPONSE' }))
    process.exit(1)
  }

  writeFileSync(OUT, JSON.stringify(parsed, null, 2))
  console.log(JSON.stringify({ ok: true, out: OUT, runtimeOk: (parsed as { ok?: boolean }).ok === true }))
}

main()
