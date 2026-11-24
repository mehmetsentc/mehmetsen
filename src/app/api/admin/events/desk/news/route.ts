/**
 * EVENT-DESK-1 — POST /api/admin/events/desk/news { eventId }
 * Etkinlik bilgisinden (kaynak + editörün eklediği bilgi ve not) AI etkinlik haberi taslağı.
 * Haber burada YAZILMAZ: istemci mevcut haber oluşturma yoluna (POST /api/admin/news) taslak olarak gönderir;
 * yetki, il kapsamı ve slug kuralları orada uygulanır.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { runWithAiUsageContext } from '@/lib/ai/usage/context'
import { isManualEditorAiEnabled } from '@/services/crawler/automatedAiPolicy'
import { guardArticleRoles, describeRoleFixes } from '@/lib/ai/editorial/roleGuard'
import { formatTrDate } from '@/lib/ai/editorial/followUp'
import { EVENT_NEWS_CATEGORY, EVENT_NEWS_SYSTEM, eventSourceText, eventVoiceScript, parseEventNews } from '@/lib/events/eventDesk'
import { eventVoiceFor } from '@/lib/events/eventVoice'
import { findDeskItem, loadDesk } from '@/lib/events/eventDeskStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 90

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:create')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManualEditorAiEnabled()) {
    return NextResponse.json({ error: 'Editör AI kapalı (MANUAL_EDITOR_AI_ENABLED)' }, { status: 403 })
  }
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Geçersiz gövde' }, { status: 400 })
  }
  const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : ''
  const now = Date.now()
  const { items } = await loadDesk(now)
  const item = eventId ? findDeskItem(items, eventId) : null
  if (!item) return NextResponse.json({ error: 'Etkinlik bulunamadı ya da geçmiş tarihli' }, { status: 404 })

  const source = eventSourceText(item, now)
  const user = `BUGÜN: ${formatTrDate(now, true)} (Europe/Istanbul)\n\nETKİNLİK BİLGİSİ:\n${source}`
  let draft = null
  let lastError = ''
  try {
    const { deepseekChatCompletion } = await import('@/lib/ai/deepseekClient')
    for (let attempt = 1; attempt <= 2 && !draft; attempt++) {
      const raw = await runWithAiUsageContext({ ingestionLane: 'manual_editor' }, () =>
        deepseekChatCompletion({
          messages: [
            { role: 'system', content: EVENT_NEWS_SYSTEM },
            { role: 'user', content: user },
          ],
          temperature: 0.4,
          maxTokens: 2200,
          timeoutMs: 45_000,
          disableThinking: true,
          jsonMode: true,
          telemetry: { agentName: 'event_desk', operation: 'event_news', promptVersion: 'event-news:v1', attempt },
        })
      )
      draft = parseEventNews(raw)
      if (!draft) lastError = 'AI cevabı eksik ya da bozuk'
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message.slice(0, 160) : 'AI hatası'
  }
  if (!draft) return NextResponse.json({ error: `Haber üretilemedi: ${lastError}` }, { status: 502 })

  // Kişi unvanları yalnızca kaynaktan (AI-ROLE-1)
  const guarded = guardArticleRoles(
    { title: draft.title, spot: draft.spot, summary: draft.summary, content: draft.content, seoTitle: draft.seoTitle, seoDescription: draft.seoDescription, socialCaption: draft.socialCaption },
    source
  )
  if (guarded.fixes.length) {
    Object.assign(draft, guarded.fields)
    console.warn(`[events/desk/news] unvan düzeltildi (${guarded.fixes.length}): ${describeRoleFixes(guarded.fixes)}`)
  }
  if (!draft.tags.includes(item.city.toLocaleLowerCase('tr-TR'))) draft.tags.unshift(item.city.toLocaleLowerCase('tr-TR'))

  const voice = await eventVoiceFor(item.citySlug)
  return NextResponse.json({
    draft,
    news: {
      categoryId: EVENT_NEWS_CATEGORY[item.category] ?? 'yerel-etkinlik',
      citySlug: item.citySlug,
      city: item.city,
      thumbnail: item.coverUrl,
      eventId: item.id,
    },
    voice: { ...voice, script: eventVoiceScript(item, now) },
  })
}
