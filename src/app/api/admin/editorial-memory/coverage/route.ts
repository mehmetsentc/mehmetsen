import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getCanonicalMemoryCoverage } from '@/services/editorial/editorialMemoryCoverage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Faz A3 Task 2 / Task 16 — Canonical Hafıza Kapsamı diagnostic.
 * READ ONLY. Same auth pair already used by /api/admin/ai-editors/[id]
 * PATCH (Task 19 — reuse existing CMS auth, no parallel mechanism).
 */
export async function GET(request: Request) {
  const auth =
    (await verifyCmsToken(request, 'editors:manage')) || (await verifyCmsToken(request, 'ai:configure'))
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const coverage = await getCanonicalMemoryCoverage()
  return NextResponse.json({ success: true, coverage })
}
