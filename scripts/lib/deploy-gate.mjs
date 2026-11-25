#!/usr/bin/env node
/**
 * Shared helpers for production deploy gating (max ~2/day).
 * Local-first workflow: accumulate all day → user approves → one [deploy] batch push.
 */

import { execSync } from 'node:child_process'

export const MAX_DEPLOYS_PER_DAY = Number(process.env.DEPLOY_MAX_PER_DAY || 1)
/** FinOps 22 Oct: [force-deploy] no longer unlimited (each deploy resets ISR + caches). */
export const MAX_FORCE_DEPLOYS_PER_DAY = Number(process.env.FORCE_DEPLOY_MAX_PER_DAY || 2)
/**
 * FinOps 21 Nov: [hotfix] was unlimited and became the everyday tag (13 production
 * deploys on 17–20 Nov). Each deploy resets ISR + in-process caches: Vercel ISR Writes
 * went from ≈$1.5 to ≈$2.2/day and builds cost up to $0.7/day. [hotfix] now builds while
 * fewer than HOTFIX_MAX_PER_DAY (default 6) production deploys happened in the last 24h.
 * [hotfix-urgent] (production is down) and FORCE_DEPLOY=1 always build.
 */
export const MAX_HOTFIX_DEPLOYS_PER_DAY = Number(process.env.HOTFIX_MAX_PER_DAY || 6)

/**
 * FinOps 25 Nov: every commit was also pushed to a feature branch and built a Preview
 * (same commit, built twice; Build CPU 43 h / $3.77 in 13 days). Preview builds now run
 * only with a [preview] tag (or FORCE_DEPLOY=1). Production is not affected.
 */
export function isPreviewRequested(message = getCommitMessage()) {
  return /\[preview\]/i.test(message)
}

/**
 * Vercel clones shallow; make sure the 24h window is in the local history before
 * counting deploy-tagged commits. Best effort: any failure keeps the old behaviour.
 */
export function deepenHistoryForCount() {
  try {
    const shallow = execSync('git rev-parse --is-shallow-repository', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (shallow !== 'true') return false
    execSync('git fetch --quiet --deepen=60 origin', {
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 20_000,
    })
    return true
  } catch {
    return false
  }
}
export const DEPLOY_WINDOW_MS = Number(
  process.env.DEPLOY_WINDOW_MS || 24 * 60 * 60 * 1000,
)
export const TZ = 'Europe/Istanbul'

/** Paths that affect the running Next.js app / Vercel build config. */
const APP_PATH_RE =
  /^(src\/|public\/|middleware\.(ts|js)$|next\.config\.|package(-lock)?\.json$|vercel\.json$|tsconfig|postcss\.config|tailwind\.config|instrumentation\.(ts|js)$)/

/** Always allow when the gate itself changes (bootstrap / updates). */
const GATE_PATH_RE =
  /^(scripts\/vercel-ignored-build\.mjs$|scripts\/lib\/deploy-gate\.mjs$|scripts\/allow-deploy\.mjs$)/

export function getCommitMessage(sha = 'HEAD') {
  const fromEnv =
    process.env.VERCEL_GIT_COMMIT_MESSAGE ||
    process.env.DEPLOY_COMMIT_MESSAGE ||
    ''
  if (fromEnv.trim()) return fromEnv
  try {
    return execSync(`git log -1 --format=%B ${sha}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

export function isForceDeploy(message = getCommitMessage()) {
  return (
    /\[force-deploy\]/i.test(message) ||
    process.env.FORCE_DEPLOY === '1' ||
    process.env.FORCE_DEPLOY === 'true'
  )
}

export function isHotfix(message = getCommitMessage()) {
  return /\[hotfix\]/i.test(message)
}

/** Production is down: always build, no daily cap. */
export function isUrgentHotfix(message = getCommitMessage()) {
  return /\[hotfix-urgent\]/i.test(message)
}

export function hasDeployTag(message = getCommitMessage()) {
  return (
    /\[deploy\]/i.test(message) ||
    /\[force-deploy\]/i.test(message) ||
    /\[hotfix\]/i.test(message) ||
    /\[hotfix-urgent\]/i.test(message)
  )
}

export function changedFiles(range = 'HEAD~1..HEAD') {
  try {
    const out = execSync(`git diff --name-only ${range}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  } catch {
    return ['src/unknown']
  }
}

export function isAppRelevant(files) {
  if (!files.length) return true
  return files.some((f) => APP_PATH_RE.test(f) || GATE_PATH_RE.test(f))
}

export function touchesDeployGate(files) {
  return files.some((f) => GATE_PATH_RE.test(f) || f === 'vercel.json')
}

/**
 * Count READY production deployments via Vercel API.
 * Needs VERCEL_TOKEN + VERCEL_PROJECT_ID (optional VERCEL_TEAM_ID).
 * Returns null if unavailable.
 */
export async function countVercelProductionDeploys({
  sinceMs = Date.now() - DEPLOY_WINDOW_MS,
} = {}) {
  const token = process.env.VERCEL_TOKEN || process.env.DEPLOY_GATE_VERCEL_TOKEN
  const projectId =
    process.env.VERCEL_PROJECT_ID ||
    process.env.DEPLOY_GATE_PROJECT_ID ||
    process.env.VERCEL_PROJECT_ID_NAHABER
  if (!token || !projectId) return null

  const params = new URLSearchParams({
    projectId,
    target: 'production',
    limit: '20',
  })
  const teamId = process.env.VERCEL_TEAM_ID || process.env.DEPLOY_GATE_TEAM_ID
  if (teamId) params.set('teamId', teamId)

  const res = await fetch(`https://api.vercel.com/v6/deployments?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    console.warn(`[deploy-gate] Vercel API ${res.status}; falling back to git`)
    return null
  }
  const data = await res.json()
  const deployments = Array.isArray(data.deployments) ? data.deployments : []
  return deployments.filter((d) => {
    const ready = d.readyState === 'READY' || d.state === 'READY'
    const created =
      typeof d.created === 'number'
        ? d.created
        : Date.parse(d.createdAt || 0)
    return ready && created >= sinceMs
  }).length
}

/** Fallback: count [deploy]/[force-deploy] commits in the rolling window. */
export function countGitDeployCommits({
  sinceMs = Date.now() - DEPLOY_WINDOW_MS,
  excludeHead = true,
} = {}) {
  try {
    const sinceIso = new Date(sinceMs).toISOString()
    const out = execSync(
      `git log --since="${sinceIso}" --format=%s${excludeHead ? ' HEAD~1' : ''}`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return out
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => /\[deploy\]|\[force-deploy\]|\[hotfix\]|\[hotfix-urgent\]/i.test(s))
      .length
  } catch {
    return 0
  }
}

export function istanbulDayBounds(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const day = fmt.format(now)
  const start = new Date(`${day}T00:00:00+03:00`)
  const end = new Date(`${day}T24:00:00+03:00`)
  return { day, startMs: start.getTime(), endMs: end.getTime() }
}

export function countGitDeployCommitsTodayIstanbul(excludeHead = true) {
  const { startMs } = istanbulDayBounds()
  return countGitDeployCommits({ sinceMs: startMs, excludeHead })
}

export async function getRecentDeployCount({
  preferApi = true,
  excludeHead = true,
} = {}) {
  if (preferApi) {
    const api = await countVercelProductionDeploys()
    if (api !== null) return { count: api, source: 'vercel-api' }
  }
  const deepened = deepenHistoryForCount()
  return {
    count: countGitDeployCommits({ excludeHead }),
    source: deepened ? 'git-log (deepened)' : 'git-log',
  }
}
