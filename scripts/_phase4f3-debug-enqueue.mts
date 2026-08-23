import { MemoryCrawlerStore } from '../src/services/crawler/store/memory'
import { MemoryAiDispatchStore } from '../src/services/crawler/aiDispatch/store'
import { runControlledAutoDraftTick } from '../src/services/crawler/autoDraft/pipeline'

process.env.DEEPSEEK_INPUT_COST_PER_1M = '0.44'
process.env.DEEPSEEK_OUTPUT_COST_PER_1M = '1.32'
process.env.CRAWLER_AI_MODE = 'CONTROLLED_AUTO_DRAFT'
process.env.CRAWLER_AI_DISPATCH_ENABLED = 'true'
process.env.CRAWLER_AI_PROVIDER_ENABLED = 'false'
process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = '2026-08-21T10:00:00.000Z'
process.env.AI_MAX_COST_PER_EVENT_USD = '0.01'
process.env.AI_MAX_DRAFTS_PER_HOUR = '2'
process.env.AI_MAX_DRAFTS_PER_DAY = '6'
process.env.AI_MAX_DAILY_COST_USD = '0.05'
process.env.AI_MAX_MONTHLY_COST_USD = '5'
process.env.CRAWLER_AI_ACCEPTANCE_MAX_EVENTS = '5'
process.env.CRAWLER_AI_ACCEPTANCE_MAX_REQUESTS = '10'
process.env.CRAWLER_AI_MAX_EVENTS_PER_TICK = '1'

const NOW = new Date('2026-08-21T12:00:00.000Z')
const RICH =
  'Manisa merkezde makilik alanda yangın çıktı. Ekipler havadan ve karadan müdahale ediyor. Vatandaşlar bölgeden uzaklaştırıldı. Rüzgar etkisiyle alevler yayıldı. Yetkililer soğutma çalışması başlattı. '.repeat(
    10
  )

async function main() {
  const crawler = new MemoryCrawlerStore()
  const ai = new MemoryAiDispatchStore()
  const sources = []
  for (let i = 0; i < 2; i++) {
    sources.push(
      await crawler.insertSource({
        name: 'S' + i,
        domain: 's' + i + '.ex',
        baseUrl: 'https://s' + i + '.ex',
        homepageUrl: 'https://s' + i + '.ex',
        countryCode: 'TR',
        language: 'tr',
        discoveryMethod: 'RSS',
        healthScore: 90,
        qualityTier: 'TIER_A',
      } as never)
    )
  }
  const articles = []
  for (let i = 0; i < 2; i++) {
    articles.push(
      await crawler.insertRawArticle({
        sourceId: sources[i].id,
        originalUrl: 'https://s' + i + '.ex/a',
        title: 'Yangın',
        articleBodyText: RICH,
        language: 'tr',
        countryCode: 'TR',
        wordCount: 400,
        extractionConfidence: 0.9,
        publishedAt: NOW,
        fetchedAt: NOW,
        qualityStatus: 'GOOD',
      } as never)
    )
  }
  const cluster = await crawler.insertCluster({
    representativeArticleId: articles[0].id,
    normalizedTopic: 'yangin',
    countryCode: 'TR',
    city: 'Manisa',
    eventKey: 'ek1',
    canonicalTitle: 'Yangın',
  })
  for (let i = 0; i < 2; i++) {
    await crawler.insertMembership({
      clusterId: cluster.id,
      articleId: articles[i].id,
      sourceId: sources[i].id,
      similarityScore: 1,
      matchBand: 'HIGH',
      isCanonical: i === 0,
    })
  }
  await crawler.updateCluster(cluster.id, {
    editorialDecision: 'NONE' as never,
    aiEligibility: 'ELIGIBLE' as never,
    uniqueSourceCount: 2,
    articleCount: 2,
    importanceScore: 70,
    clusterConfidence: 0.9,
    latestArticleAt: NOW,
    firstSeenAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  })
  const r = await runControlledAutoDraftTick({
    crawlerStore: crawler,
    aiStore: ai,
    now: NOW,
    limit: 1,
  })
  console.log(
    JSON.stringify(
      {
        jobs: r.jobsCreated,
        skip: r.skipReasons,
        aiReady: r.aiReady,
        prespend: r.prespendRejected,
        budget: r.budgetBlocked,
        shadow: { d: r.shadowWouldDispatch, b: r.shadowWouldBlock },
      },
      null,
      2
    )
  )
}

main()
