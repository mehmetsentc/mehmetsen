import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import {
  selfManagedAdsErrorResponse,
  withSelfManagedAdsAuth,
} from '@/lib/publisher/selfManagedAdApi'
import { assertAllowedCreativeMime } from '@/lib/publisher/selfManagedAdDomain'
import { adCreativeMaxBytes, AD_CREATIVE_ALLOWED_MIME } from '@/lib/publisher/selfManagedAdConfig'
import { publisherLog } from '@/lib/publisher/observability'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit'
import { buildPublisherAdMediaKey, getStorage, isR2Configured } from '@/lib/storage'
import {
  publisherManagedAdsService,
  PublisherManagedAdsError,
} from '@/services/publisher/publisherManagedAdsService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
}

interface RouteContext {
  params: Promise<{ publisherId: string; adId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { publisherId, adId } = await context.params
  const auth = await withSelfManagedAdsAuth(request, publisherId, 'ads:update')
  if ('error' in auth && auth.error) return auth.error

  const uid = auth.auth!.user.uid
  const ip = getClientIp(request)
  if (!checkRateLimit(`pmad-media:${publisherId}:${uid}:${ip}`, 20, 60_000)) {
    return rateLimitResponse()
  }

  try {
    // Ownership + membership gate
    await publisherManagedAdsService.get(publisherId, adId, uid)

    if (!isR2Configured()) {
      throw new PublisherManagedAdsError('STORAGE_UNAVAILABLE', 'INVALID_STATE')
    }

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      throw new PublisherManagedAdsError('FILE_REQUIRED', 'VALIDATION')
    }

    const mime = (file.type || '').toLowerCase()
    if (file.name.toLowerCase().endsWith('.svg') || mime === 'image/svg+xml') {
      throw new PublisherManagedAdsError('SVG_NOT_ALLOWED', 'VALIDATION')
    }
    try {
      assertAllowedCreativeMime(mime)
    } catch {
      throw new PublisherManagedAdsError('UNSUPPORTED_MEDIA_TYPE', 'VALIDATION')
    }
    if (!AD_CREATIVE_ALLOWED_MIME.has(mime)) {
      throw new PublisherManagedAdsError('UNSUPPORTED_MEDIA_TYPE', 'VALIDATION')
    }

    const maxBytes = adCreativeMaxBytes()
    if (file.size <= 0 || file.size > maxBytes) {
      throw new PublisherManagedAdsError('FILE_TOO_LARGE', 'VALIDATION')
    }

    const ext = MIME_EXT[mime] || 'bin'
    const filename = `${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`
    const key = buildPublisherAdMediaKey(publisherId, adId, filename)
    const buffer = Buffer.from(await file.arrayBuffer())

    const storage = getStorage()
    const uploaded = await storage.upload(key, buffer, { contentType: mime })
    const url = uploaded.url || storage.getPublicUrl(key)

    publisherLog('publisher_ad_media_uploaded', {
      publisherId,
      adId,
      userId: uid,
      mime,
      size: file.size,
    })

    return NextResponse.json({
      media: {
        url,
        storageProvider: 'r2',
        mime,
        size: file.size,
        key,
      },
    })
  } catch (err) {
    return selfManagedAdsErrorResponse(err)
  }
}
