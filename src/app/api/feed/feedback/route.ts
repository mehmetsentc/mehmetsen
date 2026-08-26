import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb, hasDatabaseUrl } from '@/db'
import { userFeedPreferences } from '@/db/schema/feedRanking'
import { isSmartFeedEnabled } from '@/lib/feed/featureFlag'
import { requireSocialUser } from '@/lib/social/apiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type FeedbackType = 'hide_article' | 'less_publisher' | 'less_topic'

const TYPE_MAP: Record<FeedbackType, { preferenceType: string; targetType: string }> = {
  hide_article: { preferenceType: 'hide', targetType: 'article' },
  less_publisher: { preferenceType: 'less', targetType: 'publisher' },
  less_topic: { preferenceType: 'less', targetType: 'category' },
}

export async function POST(request: Request) {
  if (!isSmartFeedEnabled()) {
    return NextResponse.json({ error: 'Smart feed disabled' }, { status: 404 })
  }
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const auth = await requireSocialUser(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as {
    type?: FeedbackType
    articleId?: string
    publisherId?: string
    category?: string
  }

  const type = body.type
  if (!type || !TYPE_MAP[type]) {
    return NextResponse.json({ error: 'invalid_type' }, { status: 400 })
  }

  let targetId: string | null = null
  if (type === 'hide_article') targetId = body.articleId?.trim() ?? null
  if (type === 'less_publisher') targetId = body.publisherId?.trim() ?? null
  if (type === 'less_topic') targetId = body.category?.trim().toLowerCase() ?? null
  if (!targetId) return NextResponse.json({ error: 'missing_target' }, { status: 400 })

  const mapping = TYPE_MAP[type]
  const db = getDb()

  await db
    .insert(userFeedPreferences)
    .values({
      id: randomUUID(),
      userId: auth.uid,
      preferenceType: mapping.preferenceType,
      targetType: mapping.targetType,
      targetId,
      modifier: -1,
    })
    .onConflictDoUpdate({
      target: [
        userFeedPreferences.userId,
        userFeedPreferences.preferenceType,
        userFeedPreferences.targetType,
        userFeedPreferences.targetId,
      ],
      set: { modifier: -1, createdAt: new Date() },
    })

  return NextResponse.json({ ok: true })
}
