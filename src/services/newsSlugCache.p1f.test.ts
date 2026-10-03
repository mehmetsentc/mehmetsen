import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('P1-F getNewsBySlug cache', () => {
  it('caches the slug lookup for an hour on news:{slug} only (FinOps: no global news-post bust)', () => {
    const news = read('src/services/newsService.server.ts')
    const start = news.indexOf('export async function getNewsBySlug')
    const block = news.slice(start, start + 1200)
    expect(block).toContain('unstable_cache')
    expect(block).toContain('revalidate: 3600')
    expect(block).toContain('tags: [`news:${normalized}`]')
  })

  it('publish, edit, and unpublish revalidate those tags and the article path', () => {
    const flows = [
      'src/services/newsroom/queue/manualQueuePublish.ts',
      'src/services/newsroom/pipeline.ts',
      'src/app/api/admin/news/route.ts',
      'src/app/api/admin/news/[id]/route.ts',
      'src/app/api/admin/news-queue/[id]/approve/route.ts',
      'src/app/api/admin/news-drafts/bulk-approve/route.ts',
      'src/app/api/admin/news-drafts/[id]/approve/route.ts',
    ]
    for (const rel of flows) {
      const source = read(rel)
      expect(source, rel).toContain('revalidatePublishedNews')
      expect(source, rel).toContain('revalidatePath(')
    }
    const helper = read('src/lib/revalidateHome.ts')
    expect(helper).toContain("revalidateTag('news-post')")
    expect(helper).toContain('revalidateTag(`news:${normalized}`)')
    const unpublish = read('src/app/api/admin/news/[id]/route.ts')
    expect(unpublish).toContain("revalidatePath(`/haber/${slug}`)")
    expect(unpublish).toContain('revalidatePublishedNews(slug)')
  })
})
