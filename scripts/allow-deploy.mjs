#!/usr/bin/env node
/**
 * Local check before a [deploy] batch push.
 * Normal Unix exits: 0 = allowed, 1 = blocked.
 *
 * Usage:
 *   npm run deploy:allowed
 *   npm run deploy:batch   # same check + short next-step hint
 *
 * Counts [deploy] commits today (Europe/Istanbul). Prefer Vercel API when
 * VERCEL_TOKEN + VERCEL_PROJECT_ID are set.
 */

import {
  MAX_DEPLOYS_PER_DAY,
  countGitDeployCommitsTodayIstanbul,
  countVercelProductionDeploys,
  istanbulDayBounds,
} from './lib/deploy-gate.mjs'

async function main() {
  const force =
    process.env.FORCE_DEPLOY === '1' ||
    process.env.FORCE_DEPLOY === 'true' ||
    process.argv.includes('--force')

  if (force) {
    console.log('✅ deploy allowed (FORCE_DEPLOY / --force)')
    process.exit(0)
  }

  const { day } = istanbulDayBounds()
  let count
  let source

  const api = await countVercelProductionDeploys({
    sinceMs: istanbulDayBounds().startMs,
  })
  if (api !== null) {
    count = api
    source = 'vercel-api'
  } else {
    count = countGitDeployCommitsTodayIstanbul(false)
    source = 'git-log (Europe/Istanbul day)'
  }

  console.log(
    `[deploy:allowed] ${day} Istanbul — ${count}/${MAX_DEPLOYS_PER_DAY} (${source})`,
  )

  if (count >= MAX_DEPLOYS_PER_DAY) {
    console.error(
      `❌ Deploy blocked: already ${count} production deploys today (max ${MAX_DEPLOYS_PER_DAY}).`,
    )
    console.error(
      '   Wait until tomorrow, or: FORCE_DEPLOY=1 / commit with [force-deploy]',
    )
    process.exit(1)
  }

  console.log(
    `✅ Deploy slot open (${count + 1}/${MAX_DEPLOYS_PER_DAY}). Batch commit with [deploy] and push once.`,
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
