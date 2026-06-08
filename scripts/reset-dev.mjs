#!/usr/bin/env node
/**
 * Stops all local Next.js dev/prod servers and clears the .next cache.
 * Multiple next-server instances corrupt .next and cause 500 / _app errors.
 *
 * Usage:
 *   node scripts/reset-dev.mjs              # kill + clear .next
 *   node scripts/reset-dev.mjs --kill-only    # kill only (npm predev)
 *   node scripts/reset-dev.mjs --start        # kill + clear + npm run dev
 */
import { execSync, spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const ports = [3000, 3001, 3002, 3003, 3004, 3005, 3020]
// Include `next build` — concurrent build + dev corrupts .next and breaks CSS/chunks.
const patterns = ['next-server', 'next dev', 'next start', 'next build']
const killOnly = process.argv.includes('--kill-only')
const shouldStart = process.argv.includes('--start')

function run(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore', shell: true })
  } catch {
    // ignore — process may already be gone
  }
}

console.log('Stopping Next.js servers…')
for (const port of ports) {
  run(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`)
}
for (const pattern of patterns) {
  run(`pkill -9 -f "${pattern}" 2>/dev/null || true`)
}

if (killOnly) {
  process.exit(0)
}

execSync('sleep 1', { shell: true })

const nextDir = join(root, '.next')
if (existsSync(nextDir)) {
  console.log('Removing .next cache…')
  rmSync(nextDir, { recursive: true, force: true })
}

if (!shouldStart) {
  console.log('Done. Run: npm run dev')
  process.exit(0)
}

console.log('Starting dev server on http://localhost:3000 …')
const child = spawn('npx', ['next', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  detached: true,
})

child.unref()
console.log(`Dev server started (pid ${child.pid ?? 'unknown'}).`)
