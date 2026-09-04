/**
 * P18.4D.1 — Candidate 2 ONLY: preserve original + Manual Editor AI rewrite into same PG draft.
 *
 * Hard-locked to ID 0SdmPVCnO8pVAbMENA9f.
 * Does NOT publish. Does NOT touch FS. Does NOT touch other pilots.
 *
 * Usage:
 *   EXECUTE_P18_4D1_C2=1 npx tsx scripts/_p18_4d1_c2_manual_ai_rewrite.mts
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const C2_ID = '0SdmPVCnO8pVAbMENA9f'
const ALLOWED = new Set([C2_ID])

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(k in process.env)) process.env[k] = v
  }
}
loadEnvLocal()

{
  const stubDir = resolve(process.cwd(), 'node_modules', 'server-only')
  if (!existsSync(stubDir)) {
    mkdirSync(stubDir, { recursive: true })
    writeFileSync(resolve(stubDir, 'index.js'), 'module.exports = {};\n')
    writeFileSync(resolve(stubDir, 'package.json'), JSON.stringify({ name: 'server-only', main: 'index.js' }))
  }
}

function fp(s: string) {
  return createHash('sha256').update(s).digest('hex').slice(0, 16)
}

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

async function main() {
  if (process.env.EXECUTE_P18_4D1_C2 !== '1') {
    console.log(JSON.stringify({ mode: 'dry-guard', message: 'Set EXECUTE_P18_4D1_C2=1 to run' }))
    process.exit(0)
  }

  // Session-only gates — do not flip crawler/legacy AI
  process.env.MANUAL_EDITOR_AI_ENABLED = 'true'
  process.env.CRAWLER_AI_DISPATCH_ENABLED = 'false'
  process.env.LEGACY_DIRECT_AI_ENABLED = 'false'

  const id = C2_ID
  if (!ALLOWED.has(id)) throw new Error('ID not allowed')

  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)

  const rows = await sql`
    SELECT id, slug, title, summary, description, content, html_content AS html,
           status::text AS status, source, source_url, legacy_firestore_id AS legacy,
           migration_batch_id AS batch, publication_authority::text AS authority
    FROM news WHERE id = ${id}`
  const row = rows[0]
  if (!row) throw new Error('pilot missing')
  if (row.status !== 'draft') throw new Error(`STOP: status=${row.status}`)
  if (row.legacy !== id) throw new Error('legacy_firestore_id mismatch')

  const originalBody = String(row.content || '')
  const snapshot = {
    preservedAt: new Date().toISOString(),
    id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    content: originalBody,
    html: row.html,
    source: row.source,
    sourceUrl: row.source_url,
    batch: row.batch,
    authority: row.authority,
    contentFp: fp(originalBody),
    bodyLen: originalBody.length,
    note: 'P18.4D.1 pre-rewrite snapshot of migrated PG draft (FS untouched)',
  }
  const snapPath = resolve(process.cwd(), 'scripts/_p18_4d1_c2_original_snapshot.json')
  writeFileSync(snapPath, JSON.stringify(snapshot, null, 2))

  const systemPrompt = `Sen NaHaber Manual Editor AI yolundaki deneyimli Türkçe haber editörüsün.
Görev: verilen haberi TELİF/BENZERLİK açısından bağımsız biçimde yeniden yaz.

ZORUNLU:
- Anlamı, kişi/kurum adlarını, tarihleri, yerleri, sayıları koru; uydurma ekleme
- Kaynağa özgü cümle yapılarını ve kelime dizilimlerini KOPYALAMA
- Kaynak boilerplate / reklam / navigasyon metni ekleme
- Bağımsız haber yapısı kur (kısa spot + ## H2 bölümler)
- HTML yazma; düz metin + markdown
- Kaynak atfını koru: haberde abartmadan kaynağı belirt
- JSON döndür: {"title":"...","summary":"...","content":"...","spot":"..."}
- summary <= 280 karakter
- content 220-450 kelime hedef; her cümle tamamlanmış olsun`

  const userMessage = `KAYNAK URL: ${row.source_url}
YAYINCI: ${row.source}
MEVCUT BAŞLIK: ${row.title}
MEVCUT ÖZET: ${row.summary || ''}
MEVCUT GÖVDE:
${originalBody}

Bu metni kaynak siteye yakın kopya olmayacak şekilde bağımsız yeniden yaz.`

  const { runWithAiUsageContext } = await import('../src/lib/ai/usage/context')
  const { deepseekChatCompletion } = await import('../src/lib/ai/deepseekClient')
  const { isManualEditorAiEnabled } = await import('../src/services/crawler/automatedAiPolicy')

  if (!isManualEditorAiEnabled()) {
    throw new Error('MANUAL_EDITOR_AI_ENABLED gate failed')
  }

  const t0 = Date.now()
  const raw = await runWithAiUsageContext({ ingestionLane: 'manual_editor' }, () =>
    deepseekChatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.4,
      maxTokens: 4500,
      timeoutMs: 90_000,
      disableThinking: true,
      jsonMode: true,
      telemetry: {
        agentName: 'p18_4d1_c2_rewrite',
        operation: 'manual_editor_rewrite',
        promptVersion: 'p18.4d1:c2:v1',
        attempt: 1,
      },
    })
  )
  const elapsedMs = Date.now() - t0

  let parsed: Record<string, unknown>
  try {
    let jsonStr = raw.trim()
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) jsonStr = fence[1]!.trim()
    if (!jsonStr.startsWith('{')) {
      const obj = jsonStr.match(/\{[\s\S]*\}/)
      if (obj) jsonStr = obj[0]
    }
    parsed = JSON.parse(jsonStr) as Record<string, unknown>
  } catch {
    throw new Error(`AI JSON parse failed (${raw.length} chars)`)
  }

  const newTitle = String(parsed.title || row.title).trim()
  const newSummary = String(parsed.summary || parsed.spot || row.summary || '')
    .trim()
    .slice(0, 500)
  const newContent = String(parsed.content || '').trim()
  if (newContent.length < 400) throw new Error('rewrite body too short — refusing to save')

  // Update ONLY this draft row content fields; keep status=draft and identity/provenance
  await sql`
    UPDATE news SET
      title = ${newTitle},
      summary = ${newSummary},
      content = ${newContent},
      html_content = NULL,
      updated_at = NOW()
    WHERE id = ${id}
      AND status = 'draft'
      AND legacy_firestore_id = ${id}`

  const after = await sql`
    SELECT id, status::text AS status, title, length(coalesce(content,''))::int AS body_len,
           legacy_firestore_id AS legacy, migration_batch_id AS batch,
           publication_authority::text AS authority
    FROM news WHERE id = ${id}`

  // Confirm other pilots untouched
  const others = await sql`
    SELECT id, length(coalesce(content,''))::int AS body_len, md5(coalesce(content,'')) AS content_md5
    FROM news WHERE id = ANY(${['0ALMkrRCE3LQqubviNZh', '0XYEJVwyi7oILuYKf91R']})`

  const out = {
    id,
    manualAction: 'EXECUTED',
    ai: {
      provider: 'deepseek',
      model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat',
      calls: 1,
      elapsedMs,
      rawChars: raw.length,
      ingestionLane: 'manual_editor',
    },
    originalPreservedPath: snapPath,
    originalFp: snapshot.contentFp,
    originalBodyLen: snapshot.bodyLen,
    afterFp: fp(newContent),
    afterBodyLen: newContent.length,
    titleBefore: row.title,
    titleAfter: newTitle,
    rowAfter: after[0],
    otherPilots: others,
    status: after[0]?.status === 'draft' ? 'DRAFT_UPDATED' : 'UNEXPECTED',
  }
  writeFileSync(
    resolve(process.cwd(), 'scripts/_p18_4d1_c2_rewrite_out.json'),
    JSON.stringify(out, null, 2)
  )
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
