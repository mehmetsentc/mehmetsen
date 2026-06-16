import { NextResponse } from 'next/server'
import {
  moderateContent,
  type ModerationMedia,
  type ModerationMediaType,
} from '@/services/moderationService'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ModerateRequestBody {
  text?: unknown
  mediaUrls?: unknown
}

function parseMedia(value: unknown): ModerationMedia[] {
  if (!Array.isArray(value)) return []
  const out: ModerationMedia[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const url = (item as { url?: unknown }).url
    const type = (item as { type?: unknown }).type
    if (typeof url !== 'string' || !url.trim()) continue
    if (type !== 'image' && type !== 'video') continue
    out.push({ url: url.trim(), type: type as ModerationMediaType })
  }
  return out
}

export async function POST(request: Request) {
  const auth = await verifyFirebaseIdToken(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateKey = `moderate:${auth.uid}:${getClientIp(request)}`
  if (!checkRateLimit(rateKey, 30, 60_000)) {
    return rateLimitResponse()
  }

  let body: ModerateRequestBody
  try {
    body = (await request.json()) as ModerateRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const text = typeof body.text === 'string' ? body.text : undefined
  const mediaUrls = parseMedia(body.mediaUrls)

  try {
    const result = await moderateContent({ text, mediaUrls })
    return NextResponse.json(result)
  } catch {
    return NextResponse.json(
      { decision: 'review', reasons: ['error:internal'], provider: 'heuristic' },
      { status: 200 }
    )
  }
}
