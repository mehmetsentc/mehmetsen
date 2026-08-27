import { NextResponse } from 'next/server'
import { publisherAdInventoryService } from '@/services/publisher/publisherAdInventoryService'
import {
  adInventoryErrorResponse,
  serializeAdInventory,
  withAdInventoryAuth,
} from '@/lib/publisher/adInventoryApi'
import type { AdInventoryUpdateInput, AdSaleStatus } from '@/types/publisherAdInventory'

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
    const item = await publisherAdInventoryService.get(
      publisherId,
      inventoryId,
      auth.auth!.user.uid
    )
    return NextResponse.json({ item: serializeAdInventory(item) })
  } catch (err) {
    return adInventoryErrorResponse(err)
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const { publisherId, inventoryId } = await context.params
  const auth = await withAdInventoryAuth(request, publisherId, 'ads:update')
  if ('error' in auth && auth.error) return auth.error
  try {
    const body = (await request.json()) as AdInventoryUpdateInput
    const item = await publisherAdInventoryService.update(
      publisherId,
      inventoryId,
      auth.auth!.user.uid,
      body
    )
    return NextResponse.json({ item: serializeAdInventory(item) })
  } catch (err) {
    return adInventoryErrorResponse(err)
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { publisherId, inventoryId } = await context.params
  const body = (await request.json()) as {
    action?: 'sale' | 'archive'
    saleStatus?: AdSaleStatus
    isPubliclyListed?: boolean
  }

  if (body.action === 'archive') {
    const auth = await withAdInventoryAuth(request, publisherId, 'ads:archive')
    if ('error' in auth && auth.error) return auth.error
    try {
      const item = await publisherAdInventoryService.archive(
        publisherId,
        inventoryId,
        auth.auth!.user.uid
      )
      return NextResponse.json({ item: serializeAdInventory(item) })
    } catch (err) {
      return adInventoryErrorResponse(err)
    }
  }

  if (body.action === 'sale' && body.saleStatus) {
    const auth = await withAdInventoryAuth(request, publisherId, 'ads:publish')
    if ('error' in auth && auth.error) return auth.error
    try {
      const item = await publisherAdInventoryService.setSaleStatus(
        publisherId,
        inventoryId,
        auth.auth!.user.uid,
        body.saleStatus,
        body.isPubliclyListed
      )
      return NextResponse.json({ item: serializeAdInventory(item) })
    } catch (err) {
      return adInventoryErrorResponse(err)
    }
  }

  return NextResponse.json({ error: 'INVALID_ACTION' }, { status: 400 })
}
