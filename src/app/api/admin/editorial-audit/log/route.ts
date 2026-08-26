/**
 * POST /api/admin/editorial-audit/log
 *
 * Her editör kararını crawlerEditorialAudit tablosuna kaydeder.
 * Bu veriler ileride "Yayın Yönetmeni Ajan"ın eğitim seti olacak.
 *
 * Payload:
 *   action       — 'approve' | 'reject' | 'delete' | 'mark_duplicate' | 'edit' | 'category_change' | 'city_change'
 *   entityId     — Firebase news/draft ID
 *   entityTitle  — Haber başlığı (not alanına yazılır)
 *   entityType   — 'firestore_news' | 'firestore_draft' (default: 'firestore_news')
 *   previousState — önceki durum (e.g. 'pending')
 *   newState     — yeni durum (e.g. 'published')
 *   reason       — kısa neden
 *   durationMs   — editörün bu habere baktığı süre (ms)
 *
 * Auth: Firebase Bearer token (news:read)
 * Fire-and-forget — hatalar loglanır ama client'e yansımaz.
 */
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getDb, hasDatabaseUrl } from '@/db'
import { crawlerEditorialAudit } from '@/db/schema/crawler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface LogPayload {
  action: string
  entityId: string
  entityTitle?: string
  entityType?: string
  previousState?: string
  newState?: string
  reason?: string
  note?: string
  durationMs?: number
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 })

  // DB yoksa sessizce başar — üretim dışı ortamlarda güvenli
  if (!hasDatabaseUrl()) return NextResponse.json({ ok: true })

  let body: LogPayload
  try {
    body = await request.json() as LogPayload
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek gövdesi' }, { status: 400 })
  }

  if (!body.action || !body.entityId) {
    return NextResponse.json({ error: 'action ve entityId gerekli' }, { status: 400 })
  }

  const db = getDb()
  const id = `ea_${randomUUID().replace(/-/g, '')}`

  // Not: durationMs ve entityTitle → note alanında saklanır (schema genişlediğinde ayrılabilir)
  const noteParts: string[] = []
  if (body.entityTitle) noteParts.push(body.entityTitle)
  if (body.durationMs) noteParts.push(`${Math.round(body.durationMs / 1000)}s izlendi`)
  const note = body.note ?? (noteParts.length ? noteParts.join(' | ') : null)

  await db
    .insert(crawlerEditorialAudit)
    .values({
      id,
      actorId: auth.uid,
      actorEmail: auth.email || null,
      actorRole: auth.role,
      action: body.action,
      entityType: body.entityType ?? 'firestore_news',
      entityId: body.entityId,
      affectedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      reason: body.reason?.slice(0, 80) ?? null,
      note: note?.slice(0, 2000) ?? null,
      previousState: body.previousState?.slice(0, 40) ?? null,
      newState: body.newState?.slice(0, 40) ?? null,
    })
    .catch(err => {
      console.warn('[editorial-audit] insert failed:', (err as Error).message)
    })

  return NextResponse.json({ ok: true, id })
}
