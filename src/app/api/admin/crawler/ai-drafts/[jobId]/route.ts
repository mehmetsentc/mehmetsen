import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { mapJobToDetail } from '@/services/crawler/editorial/aiDraftsQuery'
import { assertHumanPublishCommand, aiDraftAutoPublishAllowed } from '@/services/crawler/editorial/aiDraftsQuery'
import { hasPermission } from '@/types/cms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function findJob(jobId: string) {
  const { DrizzleAiDispatchStore } = await import('@/services/crawler/aiDispatch/drizzleStore')
  const store = new DrizzleAiDispatchStore()
  const jobs = await store.listJobs({ limit: 500 })
  return { store, job: jobs.find((j) => j.id === jobId) || null }
}

/** Open AI draft detail (snapshot only). */
export async function GET(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'Veri kaynağına ulaşılamıyor' }, { status: 503 })

  const { jobId } = await ctx.params
  const { job } = await findJob(jobId)
  if (!job) return NextResponse.json({ error: 'Taslak bulunamadı' }, { status: 404 })
  return NextResponse.json({ draft: mapJobToDetail(job), autoPublish: aiDraftAutoPublishAllowed() })
}

/**
 * Reject AI draft non-destructively — keeps snapshot + audit; no AI; no publish.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'Veri kaynağına ulaşılamıyor' }, { status: 503 })

  const { jobId } = await ctx.params
  const body = (await request.json().catch(() => ({}))) as { action?: string; reason?: string }
  if (body.action !== 'reject') {
    return NextResponse.json({ error: 'Desteklenen aksiyon: reject' }, { status: 400 })
  }

  const { store, job } = await findJob(jobId)
  if (!job) return NextResponse.json({ error: 'Taslak bulunamadı' }, { status: 404 })

  const snap = (job.draftSnapshot || {}) as Record<string, unknown>
  const nextSnap = {
    ...snap,
    editorialDecision: 'REJECTED',
    rejectedAt: new Date().toISOString(),
    rejectedBy: auth.uid,
    rejectReason: (body.reason || '').slice(0, 500) || null,
  }

  await store.updateJob(job.id, {
    draftSnapshot: nextSnap,
    blockedReason: 'EDITORIALLY_REJECTED',
  })

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    editorialDecision: 'REJECTED',
    messageTr: 'Taslak reddedildi (silinmedi, yeniden üretilmedi).',
    autoPublish: false,
  })
}

/**
 * Materialize AI draft into Firestore news draft for AdminNewsEditor.
 * Never publishes. No AI call.
 */
export async function POST(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const auth = await verifyCmsToken(request, 'news:create')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'Veri kaynağına ulaşılamıyor' }, { status: 503 })

  const { jobId } = await ctx.params
  const body = (await request.json().catch(() => ({}))) as { action?: string }
  const action = body.action || 'open_editor'

  if (action === 'publish') {
    const gate = assertHumanPublishCommand({
      authenticated: true,
      hasPublishPermission: hasPermission(auth.role, 'news:publish'),
      explicitPublish: true,
      draftValid: false, // Phase 4D.4: do not publish acceptance draft from this route
    })
    return NextResponse.json(
      {
        ok: false,
        error: 'PUBLISH_VIA_NEWS_EDITOR',
        messageTr:
          'Yayın yalnızca AdminNewsEditor üzerinden, açık insan komutu ve news:publish ile yapılır. Bu uç nokta yayınlamaz.',
        gate,
        autoPublish: aiDraftAutoPublishAllowed(),
      },
      { status: 403 }
    )
  }

  if (action !== 'open_editor') {
    return NextResponse.json({ error: 'Desteklenen aksiyon: open_editor' }, { status: 400 })
  }

  const { store, job } = await findJob(jobId)
  if (!job) return NextResponse.json({ error: 'Taslak bulunamadı' }, { status: 404 })
  const detail = mapJobToDetail(job)
  if (!detail.body && !detail.title) {
    return NextResponse.json({ error: 'draft_snapshot boş' }, { status: 400 })
  }

  const existingNewsId =
    typeof detail.draftSnapshot?.editorialFirestoreNewsId === 'string'
      ? detail.draftSnapshot.editorialFirestoreNewsId
      : null

  if (existingNewsId) {
    return NextResponse.json({
      ok: true,
      created: false,
      newsId: existingNewsId,
      editPath: `/admin/news/${existingNewsId}/edit`,
      autoPublish: false,
    })
  }

  const db = getAdminFirestore()
  const userSnap = await db.collection(Collections.USERS).doc(auth.uid).get()
  const userData = userSnap.data()
  const authorUsername = (userData?.username as string | undefined)?.trim() || 'nahaber'
  const newsRef = db.collection(Collections.NEWS).doc()
  const now = Date.now()
  const primaryUrl = detail.primarySource?.url || null

  await newsRef.set({
    title: detail.title || 'Başlıksız AI Taslağı',
    slug: detail.slug || `ai-taslak-${newsRef.id.slice(0, 8)}`,
    summary: detail.summary || '',
    description: detail.body || '',
    content: detail.body || '',
    bodyBlocks: [],
    spot: detail.spot || '',
    seoTitle: detail.seoTitle || '',
    seoDescription: detail.seoDescription || '',
    seoKeywords: detail.seoKeywords || [],
    categoryId: detail.category || '',
    category: detail.category || '',
    status: 'draft',
    type: 'news',
    source: detail.sourceName || 'NaHaber',
    sourceLabel: detail.sourceName || 'NaHaber',
    sourceUrl: primaryUrl,
    aiGenerated: true,
    aiDraftJobId: job.id,
    aiDraftClusterId: job.clusterId,
    author: authorUsername,
    authorId: auth.uid,
    authorUsername,
    authorDisplayName: (userData?.displayName as string | undefined)?.trim() || authorUsername,
    thumbnail: '',
    coverImageUrl: '',
    imageUrl: '',
    imageAlt: detail.imageAlt || '',
    tags: detail.tags || [],
    isBreaking: false,
    featured: false,
    localFeatured: false,
    manuallyEdited: false,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    viewsCount: 0,
    likesCount: 0,
    commentCount: 0,
    savesCount: 0,
    sharesCount: 0,
    visibility: 'public',
    postType: 'news',
    socialTitle: detail.socialTitle || '',
    socialDescription: detail.socialDescription || '',
    pushTitle: detail.pushTitle || '',
    pushText: detail.pushText || '',
  })

  const snap = { ...(job.draftSnapshot || {}), editorialFirestoreNewsId: newsRef.id }
  await store.updateJob(job.id, {
    draftSnapshot: snap as Record<string, unknown>,
    editorialNewsId: job.editorialNewsId || detail.draftId,
  })

  return NextResponse.json({
    ok: true,
    created: true,
    newsId: newsRef.id,
    editPath: `/admin/news/${newsRef.id}/edit`,
    autoPublish: false,
    messageTr: 'Taslak editöre aktarıldı. Yayınlanmadı.',
  })
}
