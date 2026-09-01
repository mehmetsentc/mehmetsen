/**
 * GET /api/admin/ai-policy
 *
 * Authenticated admin-only effective AI gate booleans.
 * Never returns raw env strings, keys, tokens, or secrets.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { isCrawlerAiDispatchEnabled } from '@/services/crawler/dispatch'
import { isLegacyDirectAiEnabled } from '@/services/crawler/legacyFlags'
import {
  isManualEditorAiEnabled,
  mayAutomatedCrawlerUseAi,
} from '@/services/crawler/automatedAiPolicy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const crawlerAiDispatchEnabled = isCrawlerAiDispatchEnabled()
  const legacyDirectAiEnabled = isLegacyDirectAiEnabled()
  const manualEditorAiEnabled = isManualEditorAiEnabled()

  return NextResponse.json(
    {
      crawlerAiDispatchEnabled,
      legacyDirectAiEnabled,
      manualEditorAiEnabled,
      automatedCrawlerMayUseAi: mayAutomatedCrawlerUseAi(),
      legacyMayUseAi: legacyDirectAiEnabled,
      manualEditorMayUseAi: manualEditorAiEnabled,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
