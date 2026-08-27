import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import {
  contentErrorResponse,
  withContentAuth,
} from '@/lib/publisher/contentApi'
import { isFeatureEnabledForPublisher } from '@/lib/publisher/effectiveFlags'
import {
  getPublisherMediaMaxBytes,
  isAllowedPublisherMediaMime,
  PUBLISHER_MEDIA_EXT_BY_MIME,
  PUBLISHER_MEDIA_UPLOAD_RATE_LIMIT,
} from '@/lib/publisher/contentStudioConfig'
import { publisherLog } from '@/lib/publisher/observability'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit'
import { buildPublisherContentMediaKey, getStorage, isR2Configured } from '@/lib/storage'
import { publisherContentService, PublisherContentError } from '@/services/publisher/publisherContentService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RouteContext {
  params: Promise<{ publisherId: string; contentId: string }>
}

/**
 * POST multipart: file + optional altText, credit, caption.
 * Auth + membership + content:write. No SVG. No AI alt.
 */
export async function POST(request: Request, context: RouteContext) {
  const { publisherId, contentId } = await context.params
  const auth = await withContentAuth(request, publisherId, 'content:write')
  if ('error' in auth && auth.error) return auth.error

  if (!(await isFeatureEnabledForPublisher(publisherId, 'MEDIA_UPLOAD'))) {
    return NextResponse.json({ error: 'MEDIA_UPLOAD_DISABLED', code: 'FLAG_OFF' }, { status: 404 })
  }

  const uid = auth.auth!.user.uid
  const ip = getClientIp(request)
  if (
    !checkRateLimit(
      `pcs-media:${publisherId}:${uid}:${ip}`,
      PUBLISHER_MEDIA_UPLOAD_RATE_LIMIT.limit,
      PUBLISHER_MEDIA_UPLOAD_RATE_LIMIT.windowMs
    )
  ) {
    return rateLimitResponse()
  }

  try {
    // Ensure member can edit this content (same publisher)
    await publisherContentService.get(publisherId, contentId, uid)

    if (!isR2Configured()) {
      throw new PublisherContentError('STORAGE_UNAVAILABLE', 'INVALID_STATE')
    }

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      throw new PublisherContentError('FILE_REQUIRED', 'INVALID_STATE')
    }

    const mime = (file.type || '').toLowerCase()
    if (!isAllowedPublisherMediaMime(mime)) {
      throw new PublisherContentError('UNSUPPORTED_MEDIA_TYPE', 'INVALID_STATE')
    }
    if (file.name.toLowerCase().endsWith('.svg')) {
      throw new PublisherContentError('SVG_NOT_ALLOWED', 'INVALID_STATE')
    }

    const maxBytes = getPublisherMediaMaxBytes()
    if (file.size <= 0 || file.size > maxBytes) {
      throw new PublisherContentError('FILE_TOO_LARGE', 'INVALID_STATE')
    }

    const altText = String(form.get('altText') ?? '').trim() || null
    const credit = String(form.get('credit') ?? '').trim() || null
    const caption = String(form.get('caption') ?? '').trim() || null

    const ext = PUBLISHER_MEDIA_EXT_BY_MIME[mime]
    const filename = `${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`
    const key = buildPublisherContentMediaKey(publisherId, contentId, filename)
    const buffer = Buffer.from(await file.arrayBuffer())

    const storage = getStorage()
    const uploaded = await storage.upload(key, buffer, { contentType: mime })

    const media = {
      url: uploaded.url || storage.getPublicUrl(key),
      storageProvider: 'r2',
      mime,
      size: file.size,
      altText,
      credit,
      caption,
    }

    publisherLog('publisher_media_uploaded', {
      publisherId,
      contentId,
      userId: uid,
      mime,
      size: file.size,
    })

    return NextResponse.json({ media })
  } catch (err) {
    return contentErrorResponse(err)
  }
}
