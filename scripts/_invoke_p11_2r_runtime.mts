/**
 * P11.2R-RUNTIME — invoke Production R2 diagnostic (sanitized JSON only).
 * Never prints secret values.
 *
 * Usage: npx tsx scripts/_invoke_p11_2r_runtime.mts
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

function loadEnvLocal(): Record<string, string> {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return {}
  const map = parseEnv(readFileSync(p, 'utf8'))
  for (const [k, v] of Object.entries(map)) process.env[k] = v
  return map
}

async function firebaseAdminIdToken(): Promise<string | null> {
  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim()
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim()
  const uid = process.env.NEXT_PUBLIC_ADMIN_UIDS?.split(',')[0]?.trim()
  if (!projectId || !clientEmail || !privateKey || !apiKey || !uid) return null

  const admin = await import('firebase-admin')
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    })
  }
  const customToken = await admin.auth().createCustomToken(uid)
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  )
  if (!res.ok) return null
  const data = (await res.json()) as { idToken?: string }
  return data.idToken?.trim() || null
}

function curlInvoke(url: string, bearer?: string): { body: string; http: string } {
  const args = ['-sS', '--max-time', '90', '-w', '\n__HTTP__%{http_code}', url]
  if (bearer) {
    args.push('-X', 'POST', '-H', `Authorization: Bearer ${bearer}`, '-H', 'Content-Type: application/json', '-d', '{}')
  }
  const raw = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 })
  const parts = raw.split('\n__HTTP__')
  const http = parts.pop() || ''
  return { body: parts.join('\n__HTTP__'), http }
}

async function main() {
  const local = loadEnvLocal()
  const tmp = mkdtempSync(join(tmpdir(), 'p112r-'))
  const envFile = join(tmp, 'prod.env')
  try {
    execFileSync('npx', ['vercel', 'env', 'pull', envFile, '--environment', 'production', '--yes'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'ignore', 'pipe'],
      encoding: 'utf8',
    })
  } catch {
    /* optional — local .env.local may suffice for auth */
  }

  const pulled = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}
  rmSync(tmp, { recursive: true, force: true })

  const cronCandidates = [
    local.CRON_SECRET,
    local.EVENTS_SYNC_SECRET,
    local.NEWSROOM_CRON_SECRET,
    pulled.CRON_SECRET,
    pulled.EVENTS_SYNC_SECRET,
    pulled.NEWSROOM_CRON_SECRET,
  ]
    .map((s) => (s || '').trim())
    .filter(Boolean)
  const cronSecrets = [...new Set(cronCandidates)]

  let body = ''
  let http = ''
  for (const secret of cronSecrets) {
    const res = curlInvoke(
      `${APP_URL}/api/internal/pilot/r2-health?token=${encodeURIComponent(secret)}`
    )
    body = res.body
    http = res.http
    if (http === '200') {
      try {
        const parsed = JSON.parse(body) as { error?: string }
        if (parsed.error !== 'unauthorized') break
      } catch {
        /* try next */
      }
    }
  }

  if (http !== '200' || (() => {
    try {
      return (JSON.parse(body) as { error?: string }).error === 'unauthorized'
    } catch {
      return true
    }
  })()) {
    const idToken = await firebaseAdminIdToken()
    if (idToken) {
      const res = curlInvoke(`${APP_URL}/api/internal/pilot/r2-health`, idToken)
      body = res.body
      http = res.http
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    writeFileSync(
      OUT,
      JSON.stringify({ ok: false, error: 'INVALID_JSON_RESPONSE', http, rawLength: body.length }, null, 2)
    )
    console.log(JSON.stringify({ ok: false, error: 'INVALID_JSON_RESPONSE' }))
    process.exit(1)
  }

  if ((parsed as { error?: string }).error === 'unauthorized' || http === '401') {
    writeFileSync(
      OUT,
      JSON.stringify({ ok: false, error: 'DIAGNOSTIC_AUTH_FAILED' }, null, 2)
    )
    console.log(JSON.stringify({ ok: false, error: 'DIAGNOSTIC_AUTH_FAILED' }))
    process.exit(3)
  }

  writeFileSync(OUT, JSON.stringify(parsed, null, 2))
  console.log(
    JSON.stringify({ ok: true, out: OUT, runtimeOk: (parsed as { ok?: boolean }).ok === true })
  )
}

main().catch((e) => {
  writeFileSync(
    OUT,
    JSON.stringify({ ok: false, error: 'INVOKE_EXCEPTION', detail: String(e).slice(0, 80) }, null, 2)
  )
  console.log(JSON.stringify({ ok: false, error: 'INVOKE_EXCEPTION' }))
  process.exit(1)
})
