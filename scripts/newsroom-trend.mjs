#!/usr/bin/env node
/** npm run newsroom-trend — Trend Editor */
import { triggerNewsroom } from './newsroom-shared.mjs'

await triggerNewsroom('/api/cron/newsroom/trend')
