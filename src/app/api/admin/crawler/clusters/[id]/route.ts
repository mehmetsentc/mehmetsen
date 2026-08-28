import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { dispatchCrawlerArticleToNewsroom, isCrawlerAiDispatchEnabled } from '@/services/crawler/dispatch'
import { isBulkError, runClusterBulk } from '@/services/crawler/editorial/bulk'
import {
  approvedAiStatus,
  eventAgeHours,
  groupMembersBySource,
  sourceDiversityLabel,
} from '@/services/crawler/editorial/controlPlane'
import { MACHINE_DRAFT_ELIGIBILITY_LABELS, CRAWLER_STATUS_LABELS } from '@/services/crawler/editorial/labels'
import { summarizeArticleMedia, editorialDisplayImages } from '@/services/crawler/editorial/mediaSummary'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })
  const { id } = await context.params
  const store = new DrizzleCrawlerStore()
  const cluster = await store.getCluster(id)
  if (!cluster) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const memberships = await store.listMemberships(id)
  const members = []
  for (const m of memberships) {
    const article = await store.getRawArticle(m.articleId)
    const source = article ? await store.getSource(article.sourceId) : null
    const media = article ? await store.listArticleMedia(article.id) : []
    members.push({
      sourceId: article?.sourceId || m.sourceId,
      source: source?.name || article?.sourceId,
      sourceStatus: source?.status || null,
      healthScore: source?.healthScore ?? null,
      trustTier: source?.trustTier ?? null,
      qualityTier: source?.qualityTier ?? null,
      title: article?.title,
      publishedAt: article?.publishedAt,
      wordCount: article?.wordCount,
      charCount: article?.charCount,
      extractionMethod: article?.extractionMethod,
      extractionConfidence: article?.extractionConfidence,
      similarityScore: m.similarityScore,
      membershipRole: m.membershipRole,
      isCanonical: m.isCanonical,
      url: article?.canonicalUrl || article?.originalUrl,
      preview: (article?.articleBodyText || '').slice(0, 480),
      body: article?.articleBodyText || '',
      media: summarizeArticleMedia(media),
      images: editorialDisplayImages(media).slice(0, 8).map((img) => ({
        url: img.sourceUrl,
        width: img.width,
        height: img.height,
        status: img.status,
        isPrimary: img.isPrimary,
        discoveryMethod: img.discoveryMethod,
        rejectionReason: img.rejectionReason,
      })),
    })
  }
  const grouped = [...groupMembersBySource(members)].map(([sourceId, rows]) => ({
    sourceId,
    source: rows[0]?.source,
    articleCount: rows.length,
    rows,
  }))
  const dispatchEnabled = isCrawlerAiDispatchEnabled()
  return NextResponse.json({
    aiCalls: dispatchCrawlerArticleToNewsroom().aiRequests,
    dispatchEnabled,
    cluster: {
      ...cluster,
      approvedBy: cluster.editorialDecision === 'APPROVED_FOR_AI' ? cluster.editorialDecidedBy : null,
      approvedAt: cluster.editorialDecision === 'APPROVED_FOR_AI' ? cluster.editorialDecidedAt : null,
      ageHours: Number(eventAgeHours(cluster).toFixed(1)),
      sourceDiversity: sourceDiversityLabel(cluster.articleCount, cluster.uniqueSourceCount),
      aiStatus:
        cluster.editorialDecision === 'APPROVED_FOR_AI' ? approvedAiStatus({ dispatchEnabled }) : null,
      /** Phase 4F.1 — machine automatic selection; never equals editor approval. */
      machineDraftEligibilityLabel: cluster.machineDraftEligibility
        ? MACHINE_DRAFT_ELIGIBILITY_LABELS[cluster.machineDraftEligibility] ||
          CRAWLER_STATUS_LABELS[cluster.machineDraftEligibility] ||
          cluster.machineDraftEligibility
        : null,
      humanEditorialOnly: true,
    },
    members,
    sourceGroups: grouped,
    sourceDiversity: sourceDiversityLabel(members.length, grouped.length),
  })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })
  const { id } = await context.params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const op = typeof body.op === 'string' ? body.op : 'approve_for_ai'

  if (op === 'publish_editorial') {
    const { editorialSupplyService } = await import('@/services/editorial/editorialSupplyService')
    try {
      const pubResult = await editorialSupplyService.publishClusterEditorial({
        clusterId: id,
        actorUserId: auth.uid,
        actorDisplayName: auth.email || 'Admin Editor',
        forceCategory: typeof body.category === 'string' ? body.category : null,
        isBreaking: body.isBreaking === true,
        materialUpdate: body.materialUpdate === true,
        customTitle: typeof body.customTitle === 'string' ? body.customTitle : null,
        customBody: typeof body.customBody === 'string' ? body.customBody : null,
      })
      return NextResponse.json({ success: true, result: pubResult })
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Editorial publish failed' },
        { status: 400 }
      )
    }
  }

  const store = new DrizzleCrawlerStore()
  const result = await runClusterBulk({
    store,
    actor: { uid: auth.uid, role: auth.role, email: auth.email },
    op: op as 'approve_for_ai' | 'watch' | 'review' | 'reject' | 'archive' | 'restore',
    ids: [id],
    reason: typeof body.reason === 'string' ? body.reason : null,
    note: typeof body.note === 'string' ? body.note : null,
    editorialPriority: typeof body.editorialPriority === 'string' ? body.editorialPriority : null,
    approvalSource: 'cms_single',
    selectionMode: 'single',
    confirmStale: body.confirmStale === true,
  })
  if (isBulkError(result)) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
