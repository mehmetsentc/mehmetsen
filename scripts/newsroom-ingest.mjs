#!/usr/bin/env node
/** npm run newsroom-ingest — unified ingest (workers + queue processor) */
import { triggerNewsroom } from './newsroom-shared.mjs'

await triggerNewsroom('/api/cron/newsroom/ingest')
