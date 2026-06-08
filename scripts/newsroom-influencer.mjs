#!/usr/bin/env node
/** npm run newsroom-influencer — Influencer Editor */
import { triggerNewsroom } from './newsroom-shared.mjs'

await triggerNewsroom('/api/cron/newsroom/influencer')
