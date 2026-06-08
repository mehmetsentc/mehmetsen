#!/usr/bin/env node
/** npm run newsroom-breaking — Breaking News Editor */
import { triggerNewsroom } from './newsroom-shared.mjs'

await triggerNewsroom('/api/cron/newsroom/breaking')
