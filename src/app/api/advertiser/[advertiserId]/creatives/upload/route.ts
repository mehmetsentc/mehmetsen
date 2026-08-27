import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import {
  CREATIVE_MAX_BYTES,
  CREATIVE_MIME_EXT,
  isAllowedCreativeMime,
} from '@/lib/advertiser/marketplaceDomain'
import {
  creativeGuard,
  marketplaceErrorResponse,
  requireAdvertiserAuth,
} from '@/lib/advertiser/marketplaceApi'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit'
import { buildAdvertiserCreativeMediaKey, getStorage, isR2Configured } from '@/lib/storage'
import {
  advertiserMarketplaceService,
  MarketplaceError,
} from '@/services/advertiser/advertiserMarketplaceService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Ctx {
  params: Promise<{ advertiserId: string }>
}

export async function POST(request: Request, context: Ctx) {
  const guard = creativeGuard()
  if (guard) return guard
  const { advertiserId } = await context.params
  const auth = await requireAdvertiserAuth(request, advertiserId, 'creatives:write')
  if ('error' in auth && auth.error) return auth.error

  const uid = auth.user!.uid
  const ip = getClientIp(request)
  if (!checkRateLimit(`adv-creative:${advertiserId}:${uid}:${ip}`, 20, 60_000)) {
    return rateLimitResponse()
  }

  try {
    if (!isR2Configured()) {
      throw new MarketplaceError('STORAGE_UNAVAILABLE', 'VALIDATION')
    }

    const form = await request.formData()
    const file = form.get('file')
    const creativeId = String(form.get('creativeId') ?? '').trim()
    if (!(file instanceof File)) {
      throw new MarketplaceError('FILE_REQUIRED', 'VALIDATION')
    }
    if (!creativeId) {
      throw new MarketplaceError('CREATIVE_ID_REQUIRED', 'VALIDATION')
    }

    const mime = (file.type || '').toLowerCase()
    if (!isAllowedCreativeMime(mime)) {
      throw new MarketplaceError('UNSUPPORTED_MEDIA_TYPE', 'VALIDATION')
    }
    if (file.name.toLowerCase().endsWith('.svg') || mime === 'image/svg+xml') {
      throw new MarketplaceError('SVG_NOT_ALLOWED', 'VALIDATION')
    }
    if (file.size <= 0 || file.size > CREATIVE_MAX_BYTES) {
      throw new MarketplaceError('FILE_TOO_LARGE', 'VALIDATION')
    }

    const ext = CREATIVE_MIME_EXT[mime] || 'bin'
    const filename = `${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`
    const key = buildAdvertiserCreativeMediaKey(advertiserId, filename)
    const buffer = Buffer.from(await file.arrayBuffer())
    const storage = getStorage()
    const uploaded = await storage.upload(key, buffer, { contentType: mime })
    const mediaUrl = uploaded.url || storage.getPublicUrl(key)

    const creative = await advertiserMarketplaceService.attachCreativeMedia(
      advertiserId,
      uid,
      creativeId,
      mediaUrl
    )

    return NextResponse.json({
      mediaUrl,
      creative: {
        ...creative,
        createdAt: creative.createdAt.toISOString(),
        updatedAt: creative.updatedAt.toISOString(),
      },
    })
  } catch (err) {
    return marketplaceErrorResponse(err)
  }
}
