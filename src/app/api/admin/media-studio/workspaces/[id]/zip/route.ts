import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { zipWorkspace } from '@/media-studio/server/execute'
import { StudioHttpError } from '@/media-studio/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyCmsToken(request, 'video:read')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    const zip = await zipWorkspace(user.uid, id)
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${id}.zip"`,
      },
    })
  } catch (error) {
    const message = error instanceof StudioHttpError ? error.message : 'ZIP oluşturulamadı.'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
