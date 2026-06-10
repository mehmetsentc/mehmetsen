import { TECH_NEWS_SOURCE_IDS } from '@/services/newsroom/config'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/**
 * Technology worker — TechCrunch, The Verge, Wired, Ars Technica, MIT Tech Review,
 * VentureBeat, OpenAI Blog, Google Blog, Microsoft Blog, Apple Newsroom,
 * ShiftDelete, Webtekno, Donanım Haber, Chip TR.
 * Covers: AI, software, hardware, startups, cybersecurity, mobile, gaming.
 * Cron: every 10 min.
 */
export async function runTechWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'tech-news',
    editorType: 'national',
    sourceIds: TECH_NEWS_SOURCE_IDS,
    forcedCategoryId: 'teknoloji',
    enrichInput: (_item, source) => ({
      extraTags: [
        'teknoloji',
        source.id.includes('openai') || source.id.includes('google') || source.id.includes('microsoft')
          ? 'yapay-zeka'
          : 'yazilim',
      ],
    }),
  })
}
