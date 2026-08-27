import { NextResponse } from 'next/server'
import { publisherAdInventoryService } from '@/services/publisher/publisherAdInventoryService'
import {
  adInventoryErrorResponse,
  serializeAdInventory,
  withAdInventoryAuth,
} from '@/lib/publisher/adInventoryApi'
import type { AdInventoryCreateInput } from '@/types/publisherAdInventory'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ publisherId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const { publisherId } = await context.params
  const auth = await withAdInventoryAuth(request, publisherId, 'ads:read')
  if ('error' in auth && auth.error) return auth.error
  try {
    const url = new URL(request.url)
    const includeArchived = url.searchParams.get('includeArchived') === '1'
    const [items, dashboard] = await Promise.all([
      publisherAdInventoryService.list(publisherId, auth.auth!.user.uid, { includeArchived }),
      publisherAdInventoryService.dashboard(publisherId, auth.auth!.user.uid),
    ])
    return NextResponse.json({
      items: items.map(serializeAdInventory),
      dashboard,
    })
  } catch (err) {
    return adInventoryErrorResponse(err)
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { publisherId } = await context.params
  const auth = await withAdInventoryAuth(request, publisherId, 'ads:create')
  if ('error' in auth && auth.error) return auth.error
  try {
    const body = (await request.json()) as AdInventoryCreateInput
    const item = await publisherAdInventoryService.create(
      publisherId,
      auth.auth!.user.uid,
      body
    )
    return NextResponse.json({ item: serializeAdInventory(item) }, { status: 201 })
  } catch (err) {
    return adInventoryErrorResponse(err)
  }
}
