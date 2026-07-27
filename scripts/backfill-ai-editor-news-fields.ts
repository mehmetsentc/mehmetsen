/**
 * Backfill persona authorship fields dropped by draftToPublishedNews.
 * Run: npx tsx scripts/backfill-ai-editor-news-fields.ts
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function loadEnvFile(filename: string) {
  const path = join(process.cwd(), filename)
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

async function main() {
  loadEnvFile('.env.local')
  const { getAdminFirestore } = await import('../src/lib/firebase/admin')
  const { Collections } = await import('../src/lib/firebase/collections')
  const db = getAdminFirestore()

  const editorsSnap = await db.collection(Collections.AI_EDITORS).get()
  const byAuthorUid = new Map<
    string,
    { id: string; slug: string; name: string; avatarUrl: string | null }
  >()
  for (const doc of editorsSnap.docs) {
    const d = doc.data()
    const authorUid = String(d.authorUid || '')
    if (!authorUid) continue
    byAuthorUid.set(authorUid, {
      id: doc.id,
      slug: String(d.slug || ''),
      name: String(d.name || d.slug || ''),
      avatarUrl: (d.avatarUrl as string | null | undefined) ?? null,
    })
  }

  console.log('editors_indexed', byAuthorUid.size)

  const recent = await db
    .collection(Collections.NEWS)
    .where('status', '==', 'published')
    .orderBy('publishedAt', 'desc')
    .limit(200)
    .get()

  let updated = 0
  let skipped = 0

  for (const doc of recent.docs) {
    const data = doc.data()
    const authorId = String(data.authorId || '')
    if (!authorId.startsWith('ai_editor_')) {
      skipped++
      continue
    }

    const editor = byAuthorUid.get(authorId)
    if (!editor) {
      console.warn('no_editor_for', authorId, doc.id)
      skipped++
      continue
    }

    const patch: Record<string, unknown> = {}
    if (!data.aiEditorId) patch.aiEditorId = editor.id
    if (!data.authorUsername) patch.authorUsername = editor.slug
    if (!data.authorDisplayName) patch.authorDisplayName = editor.name
    if (data.authorPhotoURL === undefined) patch.authorPhotoURL = editor.avatarUrl
    if (!data.articleFormat) patch.articleFormat = 'standard'
    if (data.author !== editor.slug && data.author !== editor.name) {
      patch.author = editor.slug
    }

    if (Object.keys(patch).length === 0) {
      skipped++
      continue
    }

    patch.updatedAt = Date.now()
    await doc.ref.update(patch)
    updated++
    console.log('updated', doc.id, patch)
  }

  // Also repair approved drafts' linked news via approvedNewsId when present
  const drafts = await db
    .collection(Collections.NEWS_DRAFTS)
    .where('draftStatus', '==', 'approved')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get()

  for (const draft of drafts.docs) {
    const d = draft.data()
    const newsId = String(d.approvedNewsId || '')
    if (!newsId) continue
    const newsRef = db.collection(Collections.NEWS).doc(newsId)
    const newsSnap = await newsRef.get()
    if (!newsSnap.exists) continue
    const data = newsSnap.data()!
    const authorId = String(data.authorId || d.authorId || '')
    const editor = byAuthorUid.get(authorId)
    if (!editor) continue

    const patch: Record<string, unknown> = {}
    if (!data.aiEditorId) {
      patch.aiEditorId = String(d.aiEditorId || editor.id)
    }
    if (!data.authorUsername) {
      patch.authorUsername = String(d.authorUsername || editor.slug)
    }
    if (!data.authorDisplayName) {
      patch.authorDisplayName = String(d.authorDisplayName || editor.name)
    }
    if (data.authorPhotoURL === undefined) {
      patch.authorPhotoURL = d.authorPhotoURL ?? editor.avatarUrl
    }
    if (!data.articleFormat) {
      patch.articleFormat = d.articleFormat || 'standard'
    }
    if (Object.keys(patch).length === 0) continue
    patch.updatedAt = Date.now()
    await newsRef.update(patch)
    updated++
    console.log('updated_from_draft', newsId, patch)
  }

  console.log(JSON.stringify({ updated, skipped, scanned: recent.size }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
