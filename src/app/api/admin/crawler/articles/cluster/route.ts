/**
 * GET /api/admin/crawler/articles/cluster
 *
 * Bir haber başlığına benzer ham makaleleri ve küme bilgisini döner.
 * Editör "Tekrar Haber" butonuna tıkladığında bu endpoint çağrılır.
 *
 * Query params:
 *   title        — haber başlığı (anahtar kelime araması)
 *   rawArticleId — ham makale ID (doğrudan küme araması)
 *
 * Auth: Firebase Bearer token (news:read)
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getDb, hasDatabaseUrl } from '@/db'
import { rawArticles, newsClusters, newsSources } from '@/db/schema/crawler'
import { and, desc, eq, gte, ilike, or } from 'drizzle-orm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface TitleMatch {
  id: string
  title: string | null
  sourceName: string
  publishedAt: string | null
  editorialStatus: string
}

interface ClusterInfo {
  id: string
  canonicalTitle: string | null
  articleCount: number
  sourceCount: number
  uniqueSourceCount: number
  importanceScore: number
  nationalImportance: number
  localImportance: number
  firstSeenAt: string | null
  lastSeenAt: string | null
}

interface ClusterResult {
  found: boolean
  cluster?: ClusterInfo
  titleMatches: TitleMatch[]
  totalMatches: number
}

function mapCluster(row: typeof newsClusters.$inferSelect): ClusterInfo {
  return {
    id: row.id,
    canonicalTitle: row.canonicalTitle,
    articleCount: row.articleCount,
    sourceCount: row.sourceCount,
    uniqueSourceCount: row.uniqueSourceCount,
    importanceScore: row.importanceScore,
    nationalImportance: row.nationalImportance,
    localImportance: row.localImportance,
    firstSeenAt: row.firstSeenAt?.toISOString() ?? null,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const url = request.nextUrl
  const title = (url.searchParams.get('title') ?? '').trim()
  const rawArticleId = (url.searchParams.get('rawArticleId') ?? '').trim()

  if (!title && !rawArticleId) {
    return NextResponse.json({ error: 'title veya rawArticleId gerekli' }, { status: 400 })
  }

  if (!hasDatabaseUrl()) {
    const empty: ClusterResult = { found: false, titleMatches: [], totalMatches: 0 }
    return NextResponse.json(empty)
  }

  const db = getDb()
  const result: ClusterResult = { found: false, titleMatches: [], totalMatches: 0 }

  // Strateji 1: rawArticleId → doğrudan küme araması
  if (rawArticleId) {
    const [rawRow] = await db
      .select({ clusterId: rawArticles.clusterId })
      .from(rawArticles)
      .where(eq(rawArticles.id, rawArticleId))
      .limit(1)

    if (rawRow?.clusterId) {
      const [cluster] = await db
        .select()
        .from(newsClusters)
        .where(eq(newsClusters.id, rawRow.clusterId))
        .limit(1)
      if (cluster) {
        result.found = true
        result.cluster = mapCluster(cluster)
      }
    }
  }

  // Strateji 2: Başlık anahtar kelime araması (son 72 saat)
  if (title) {
    // 3+ karakter olan anlamlı kelimeleri al, max 6
    const keywords = title
      .split(/\s+/)
      .map(w => w.replace(/['"„"»«()\[\]{}.,;:!?]/g, '').trim())
      .filter(w => w.length >= 3)
      .slice(0, 6)

    if (keywords.length > 0) {
      const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000)
      const searchClauses = keywords.map(kw => ilike(rawArticles.title, `%${kw}%`))

      const rows = await db
        .select({
          id: rawArticles.id,
          title: rawArticles.title,
          sourceName: newsSources.name,
          publishedAt: rawArticles.publishedAt,
          editorialStatus: rawArticles.editorialStatus,
          clusterId: rawArticles.clusterId,
        })
        .from(rawArticles)
        .innerJoin(newsSources, eq(rawArticles.sourceId, newsSources.id))
        .where(
          and(
            or(...(searchClauses as Parameters<typeof or>)),
            gte(rawArticles.createdAt, cutoff)
          )
        )
        .orderBy(desc(rawArticles.publishedAt))
        .limit(25)

      result.titleMatches = rows.map(r => ({
        id: r.id,
        title: r.title,
        sourceName: r.sourceName,
        publishedAt: r.publishedAt?.toISOString() ?? null,
        editorialStatus: r.editorialStatus,
      }))
      result.totalMatches = rows.length

      // Küme henüz bulunamadıysa ilk küme ID'li makaleden al
      if (!result.found) {
        const clusterMatch = rows.find(r => r.clusterId)
        if (clusterMatch?.clusterId) {
          const [cluster] = await db
            .select()
            .from(newsClusters)
            .where(eq(newsClusters.id, clusterMatch.clusterId))
            .limit(1)
          if (cluster) {
            result.found = true
            result.cluster = mapCluster(cluster)
          }
        }
      }
    }
  }

  return NextResponse.json(result)
}
