import { NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/adminAuth'
import { newsDraftService } from '@/services/newsDraftService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** Approve legacy `news` docs with status pending (pre-migration). */
export async function POST(request: Request, context: RouteContext) {
  const admin = await verifyAdminRequest(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params

  try {
    const result = await newsDraftService.approveLegacyPending(id, { uid: admin.uid })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Approve failed'
    const status =
      message.includes('not found')
        ? 404
        : message.includes('PUBLICATION_AUTHORITY_REJECTED') ||
            message.includes('EDITORIAL_GATE_REJECTED')
          ? 403
          : 500
    return NextResponse.json({ error: message }, { status })
  }
}
