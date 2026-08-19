#!/usr/bin/env npx tsx
/** Local acceptance — metadata only, no article body, no AI dispatch. */
import { MemoryCrawlerStore } from '../src/services/crawler/store/memory'
import { testCrawlerSource } from '../src/services/crawler/testSource'
import type { InsertSourceInput } from '../src/services/crawler/store/types'

process.env.NEWS_CRAWLER_MIN_INTERVAL_MS = '0'
process.env.CRAWLER_AI_DISPATCH_ENABLED = 'false'

const cases: InsertSourceInput[] = [
  {
    name: 'BBC World RSS',
    domain: 'bbc.com',
    baseUrl: 'https://www.bbc.com',
    countryCode: 'GB',
    language: 'en',
    discoveryMethod: 'RSS',
    rssUrls: ['https://feeds.bbci.co.uk/news/world/rss.xml'],
  },
  {
    name: 'The Guardian World RSS',
    domain: 'theguardian.com',
    baseUrl: 'https://www.theguardian.com',
    countryCode: 'GB',
    language: 'en',
    discoveryMethod: 'RSS',
    rssUrls: ['https://www.theguardian.com/world/rss'],
  },
]

async function main() {
  for (const input of cases) {
    const store = new MemoryCrawlerStore()
    try {
      const result = await testCrawlerSource({ store, input })
      console.log(
        JSON.stringify({
          source: input.name,
          discoveryMethod: input.discoveryMethod,
          urlsDiscovered: result.discovery.discovered,
          urlsInserted: result.discovery.inserted,
          httpStatus: result.fetch?.status ?? null,
          extractionMethod: result.extraction?.method ?? null,
          titleFound: result.extraction?.titleFound ?? false,
          wordCount: result.extraction?.wordCount ?? 0,
          paragraphCount: result.extraction?.paragraphCount ?? 0,
          imageFound: result.extraction?.imageFound ?? false,
          publishedAtFound: result.extraction?.publishedAtFound ?? false,
          extractionConfidence: result.extraction?.confidence ?? null,
          aiCalls: result.dispatch.aiRequests,
          dispatched: result.dispatch.dispatched,
        })
      )
    } catch (err) {
      console.log(
        JSON.stringify({
          source: input.name,
          error: err instanceof Error ? err.message : String(err),
          aiCalls: 0,
        })
      )
    }
  }
}

void main()
