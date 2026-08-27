import { NextResponse } from 'next/server'
import { publisherAdInventoryService } from '@/services/publisher/publisherAdInventoryService'
import {
  adInventoryErrorResponse,
  withAdInventoryAuth,
} from '@/lib/publisher/adInventoryApi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ publisherId: string; inventoryId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const { publisherId, inventoryId } = await context.params
  const auth = await withAdInventoryAuth(request, publisherId, 'ads:read')
  if ('error' in auth && auth.error) return auth.error
  try {
    const events = await publisherAdInventoryService.listAudit(
      publisherId,
      inventoryId,
      auth.auth!.user.uid
    )
    return NextResponse.json({
      events: events.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    return adInventoryErrorResponse(err)
  }
}
