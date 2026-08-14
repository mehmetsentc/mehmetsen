import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import {
  getPageLayout,
  listPageLayoutVersions,
  listPageLayouts,
  publishPageLayout,
  savePageLayoutDraft,
} from '@/services/newsroomOs/pageLayoutService'
import type { PageLayoutBlock } from '@/types/newsroomOs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyCmsToken(request, 'pages:manage')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pageKey = request.nextUrl.searchParams.get('page')
  const versions = request.nextUrl.searchParams.get('versions') === '1'
  if (pageKey && versions) {
    return NextResponse.json({ versions: await listPageLayoutVersions(pageKey) })
  }
  if (pageKey) {
    return NextResponse.json({ layout: await getPageLayout(pageKey) })
  }
  return NextResponse.json({ layouts: await listPageLayouts() })
}

export async function PUT(request: NextRequest) {
  const auth = await verifyCmsToken(request, 'pages:manage')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as {
    pageKey?: string
    action?: 'save' | 'publish'
    label?: string
    blocks?: PageLayoutBlock[]
  }
  if (!body.pageKey) return NextResponse.json({ error: 'pageKey required' }, { status: 400 })

  if (body.action === 'publish') {
    const layout = await publishPageLayout(body.pageKey, auth.uid)
    return NextResponse.json({ layout })
  }

  const layout = await savePageLayoutDraft(body.pageKey, {
    label: body.label,
    blocks: body.blocks,
    updatedBy: auth.uid,
  })
  return NextResponse.json({ layout })
}
