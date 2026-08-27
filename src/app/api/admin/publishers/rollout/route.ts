import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import { hasDatabaseUrl } from '@/db'
import { publisherFeatureAccessService } from '@/services/publisher/publisherFeatureAccessService'
import { getOperatorChecklist, ROLLOUT_STAGES } from '@/lib/publisher/rolloutMatrix'
import { getPublisherPlatformHealth } from '@/services/publisher/publisherPlatformHealthService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }

  const url = new URL(request.url)
  const stageRaw = Number(url.searchParams.get('stage') ?? '0')
  const stage = ([0, 1, 2, 3, 4, 5].includes(stageRaw) ? stageRaw : 0) as 0 | 1 | 2 | 3 | 4 | 5

  const [visibility, health] = await Promise.all([
    publisherFeatureAccessService.rolloutVisibility(),
    getPublisherPlatformHealth(),
  ])

  return NextResponse.json({
    stage,
    stageMeta: ROLLOUT_STAGES[stage],
    operatorChecklist: getOperatorChecklist(stage),
    visibility,
    health,
    payment: {
      commercialLedger: false,
      paymentIntent: false,
      earnings: false,
      note: 'P10A stays dark — no payment activation in P11.',
    },
  })
}
