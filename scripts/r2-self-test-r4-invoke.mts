/**
 * V1C.1R4 operator invoke — explicit actions only, no secret presence logging.
 *
 * Pulls production env into a temp file (never printed), runs the same
 * run/cleanup/cors helpers against live R2, then shreds the temp file.
 *
 * Usage:
 *   npx tsx scripts/r2-self-test-r4-invoke.mts --action=all
 *   npx tsx scripts/r2-self-test-r4-invoke.mts --action=run
 *   npx tsx scripts/r2-self-test-r4-invoke.mts --action=cleanup --validationId=<uuid>
 *   npx tsx scripts/r2-self-test-r4-invoke.mts --action=cors-inspect
 *   npx tsx scripts/r2-self-test-r4-invoke.mts --action=cors-apply
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  applyPlaybackCors,
  assertSafeDiagnosticJson,
  cleanupR2SelfTest,
  inspectR2Cors,
  runR2SelfTest,
} from '../src/lib/storage/r2SelfTest'

const OUT = resolve(process.cwd(), 'scripts/_v1c1r4-runtime-report.json')
const ALLOWED = new Set(['run', 'cleanup', 'cors-inspect', 'cors-apply', 'all'])
const R2_NAMES = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
] as const

function argValue(flag: string): string | undefined {
  const prefix = `${flag}=`
  const hit = process.argv.find((item) => item === flag || item.startsWith(prefix))
  if (!hit) return undefined
  if (hit.startsWith(prefix)) return hit.slice(prefix.length)
  const idx = process.argv.indexOf(hit)
  return process.argv[idx + 1]
}

function parseEnvFile(raw: string): Record<string, string> {
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

function presence(env: Record<string, string>) {
  const r2: Record<string, boolean> = {}
  for (const name of R2_NAMES) r2[name] = Boolean(env[name])
  return {
    configured: r2.R2_ACCOUNT_ID && r2.R2_ACCESS_KEY_ID && r2.R2_SECRET_ACCESS_KEY,
    r2,
  }
}

function writeReport(payload: unknown, code: number): never {
  try {
    assertSafeDiagnosticJson(payload)
  } catch {
    const blocked = { ok: false, error: 'UNSAFE_DIAGNOSTIC_PAYLOAD', go: false }
    writeFileSync(OUT, JSON.stringify(blocked, null, 2))
    console.log(JSON.stringify(blocked))
    process.exit(1)
  }
  writeFileSync(OUT, JSON.stringify(payload, null, 2))
  console.log(JSON.stringify(payload))
  process.exit(code)
}

function pullProductionEnv(): Record<string, string> {
  const tmp = mkdtempSync(join(tmpdir(), 'v1c1r4-'))
  const envFile = join(tmp, 'prod.env')
  try {
    const pulled = spawnSync(
      'npx',
      ['vercel', 'env', 'pull', envFile, '--environment', 'production', '--yes'],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    if (pulled.status !== 0 || pulled.error) {
      rmSync(tmp, { recursive: true, force: true })
      writeReport({ ok: false, error: 'ENV_PULL_FAILED', go: false }, 2)
    }
    const env = parseEnvFile(readFileSync(envFile, 'utf8'))
    rmSync(tmp, { recursive: true, force: true })
    return env
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true })
    writeReport({ ok: false, error: 'ENV_PULL_FAILED', go: false }, 2)
  }
}

async function main() {
  const action = (argValue('--action') || '').trim().toLowerCase()
  const validationIdArg = argValue('--validationId')
  if (!action || !ALLOWED.has(action)) {
    writeReport({ ok: false, error: 'ACTION_REQUIRED', go: false }, 1)
  }

  const env = pullProductionEnv()
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
  process.env.R2_SELF_TEST_ENABLED = '1'

  const configured = presence(env)
  if (!configured.configured) {
    writeReport({ ok: false, error: 'R2_NOT_CONFIGURED', go: false, configured: false }, 3)
  }

  if (action === 'cors-inspect') {
    const result = await inspectR2Cors()
    writeReport({ ok: result.inspect === 'PASS', go: false, configured: true, result }, result.inspect === 'PASS' ? 0 : 4)
  }
  if (action === 'cors-apply') {
    const result = await applyPlaybackCors()
    writeReport({ ok: result.apply === 'PASS', go: false, configured: true, result }, result.apply === 'PASS' ? 0 : 4)
  }
  if (action === 'run') {
    const result = await runR2SelfTest()
    writeReport(
      { ok: result.upload === 'PASS', go: false, configured: true, result },
      result.upload === 'PASS' ? 0 : 4,
    )
  }
  if (action === 'cleanup') {
    if (!validationIdArg) writeReport({ ok: false, error: 'VALIDATION_ID_REQUIRED', go: false }, 1)
    const result = await cleanupR2SelfTest(validationIdArg)
    writeReport(
      {
        ok: result.go,
        go: result.go,
        configured: true,
        createdCount: result.createdCount,
        deletedCount: result.deletedCount,
        remainingCount: result.remainingCount,
        result,
      },
      result.go ? 0 : 5,
    )
  }

  const inspect = await inspectR2Cors()
  const cors = inspect.changed ? await applyPlaybackCors() : inspect
  const run = await runR2SelfTest()
  const validationId = run.validationId
  if (!validationId) {
    writeReport({ ok: false, error: 'NO_VALIDATION_ID', go: false, configured: true, inspect, cors, run }, 4)
  }
  const cleanup = await cleanupR2SelfTest(validationId)
  const playback =
    run.upload === 'PASS' &&
    run.publicGet === 'PASS' &&
    run.rangeStart === 'PASS' &&
    run.rangeMiddle === 'PASS' &&
    run.faststart === 'PASS'
  const go = playback && cleanup.go === true
  writeReport(
    {
      ok: go,
      go,
      configured: true,
      createdCount: cleanup.createdCount,
      deletedCount: cleanup.deletedCount,
      remainingCount: cleanup.remainingCount,
      playback,
      corsApply: cors.apply,
      run: {
        upload: run.upload,
        publicGet: run.publicGet,
        rangeStart: run.rangeStart,
        rangeMiddle: run.rangeMiddle,
        faststart: run.faststart,
        cors: run.cors,
        validationId: run.validationId,
      },
      cleanup: {
        cleanup: cleanup.cleanup,
        go: cleanup.go,
        createdCount: cleanup.createdCount,
        deletedCount: cleanup.deletedCount,
        remainingCount: cleanup.remainingCount,
      },
    },
    go ? 0 : 5,
  )
}

void main()
