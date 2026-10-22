#!/usr/bin/env node
/**
 * Vercel Ignored Build Step (vercel.json → ignoreCommand).
 *
 * Exit 0 = SKIP build | Exit 1 = PROCEED (Vercel inverts usual Unix meaning).
 *
 * Policy (local-first batch deploy):
 * 1. FORCE_DEPLOY=1 or [hotfix] → always build.
 *    [force-deploy] → build while < FORCE_DEPLOY_MAX_PER_DAY (default 4) READY prod
 *    deploys in the last 24h (FinOps 22 Oct: ~20 force-deploys in 6 days reset ISR +
 *    in-process caches each time; Vercel ISR writes and Firestore reads doubled).
 * 2. Docs/scripts-only (no app paths) → skip
 * 3. No [deploy] in commit message → skip
 * 4. [deploy] allowed only if < DEPLOY_MAX_PER_DAY (default 2) READY prod
 *    deploys in the last 24h (Vercel API, else git [deploy] count)
 */

import {
  MAX_DEPLOYS_PER_DAY,
  MAX_FORCE_DEPLOYS_PER_DAY,
  isHotfix,
  changedFiles,
  getCommitMessage,
  getRecentDeployCount,
  hasDeployTag,
  isAppRelevant,
  isForceDeploy,
  touchesDeployGate,
} from './lib/deploy-gate.mjs'

function skip(reason) {
  console.log(`🛑 Skip build: ${reason}`)
  process.exit(0)
}

function proceed(reason) {
  console.log(`✅ Build: ${reason}`)
  process.exit(1)
}

async function main() {
  const message = getCommitMessage()
  const files = changedFiles()
  const env = process.env.VERCEL_ENV || 'unknown'

  console.log(`[deploy-gate] env=${env} files=${files.length}`)
  console.log(`[deploy-gate] message: ${message.split('\n')[0]?.slice(0, 120)}`)

  if (process.env.FORCE_DEPLOY === '1' || process.env.FORCE_DEPLOY === 'true') {
    proceed('FORCE_DEPLOY env')
  }

  if (isHotfix(message)) {
    proceed('[hotfix] (production-breaking fix)')
  }

  if (isForceDeploy(message)) {
    const recent = await getRecentDeployCount({ excludeHead: true })
    console.log(
      `[deploy-gate] [force-deploy] recent prod deploys=${recent.count}/${MAX_FORCE_DEPLOYS_PER_DAY} (${recent.source})`,
    )
    if (recent.count < MAX_FORCE_DEPLOYS_PER_DAY) {
      proceed(`[force-deploy] within daily cap (${recent.count + 1}/${MAX_FORCE_DEPLOYS_PER_DAY})`)
    }
    skip(
      `[force-deploy] cap: ${recent.count} prod deploys in last 24h (max ${MAX_FORCE_DEPLOYS_PER_DAY}). ` +
        'Batch changes into the next deploy, or use [hotfix] only if production is broken.',
    )
  }

  // Gate / vercel.json updates must land even if the daily quota is already used.
  if (touchesDeployGate(files) && hasDeployTag(message)) {
    proceed('deploy-gate files changed')
  }

  if (!isAppRelevant(files)) {
    skip('docs/scripts/markdown-only (no app runtime paths)')
  }

  if (!hasDeployTag(message)) {
    skip('commit message has no [deploy] (local-first: batch later)')
  }

  const { count, source } = await getRecentDeployCount({ excludeHead: true })
  console.log(
    `[deploy-gate] recent prod deploys=${count}/${MAX_DEPLOYS_PER_DAY} (${source})`,
  )

  if (count >= MAX_DEPLOYS_PER_DAY) {
    skip(
      `rate limit: ${count} prod deploys in last 24h (max ${MAX_DEPLOYS_PER_DAY}). Use [force-deploy] if urgent.`,
    )
  }

  proceed(`[deploy] within daily quota (${count + 1}/${MAX_DEPLOYS_PER_DAY})`)
}

main().catch((err) => {
  console.error('[deploy-gate] error — proceeding to avoid false cancels:', err)
  process.exit(1)
})
