#!/usr/bin/env node
/** npm run newsroom-local — Local News Editor (AA, DHA, İHA, …) */
import { triggerNewsroom } from './newsroom-shared.mjs'

await triggerNewsroom('/api/cron/newsroom/local')
