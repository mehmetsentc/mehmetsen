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

  const recent = await db
    .collection(Collections.NEWS)
    .orderBy('publishedAt', 'desc')
    .limit(50)
    .get()

  const withAi = recent.docs
    .map((d) => {
      const x = d.data()
      return {
        id: d.id,
        title: String(x.title || '').slice(0, 60),
        status: x.status,
        aiEditorId: x.aiEditorId ?? null,
        authorId: x.authorId ?? null,
        categoryId: x.categoryId ?? x.category ?? null,
        publishedAt: x.publishedAt ?? null,
        hasPublishedAt: x.publishedAt != null,
      }
    })
    .filter((r) => r.aiEditorId)

  console.log('published_news_with_aiEditorId', withAi.length)
  console.log(JSON.stringify(withAi.slice(0, 15), null, 2))

  const anyAuthor = recent.docs
    .map((d) => {
      const x = d.data()
      const authorId = String(x.authorId || '')
      return {
        id: d.id,
        title: String(x.title || '').slice(0, 50),
        status: x.status,
        authorId,
        aiEditorId: x.aiEditorId ?? null,
        categoryId: x.categoryId ?? x.category,
        isSynthetic: authorId.startsWith('ai_editor_'),
      }
    })
    .filter((r) => r.isSynthetic || r.aiEditorId)

  console.log('synthetic_or_ai_in_last_50', anyAuthor.length)
  console.log(JSON.stringify(anyAuthor.slice(0, 15), null, 2))

  const drafts = await db
    .collection(Collections.NEWS_DRAFTS)
    .orderBy('createdAt', 'desc')
    .limit(30)
    .get()
  const draftAi = drafts.docs
    .map((d) => {
      const x = d.data()
      return {
        id: d.id,
        title: String(x.title || '').slice(0, 50),
        aiEditorId: x.aiEditorId ?? null,
        authorId: x.authorId ?? null,
        draftStatus: x.draftStatus ?? x.status,
        categoryId: x.categoryId,
        reasons: x.gateReasons ?? x.draftReasons ?? null,
      }
    })
    .filter((r) => r.aiEditorId || String(r.authorId || '').startsWith('ai_editor_'))
  console.log('recent_drafts_ai', draftAi.length)
  console.log(JSON.stringify(draftAi.slice(0, 12), null, 2))

  for (const id of ['8h9aerqqdMzlPATPQD7G', 'a1jQazIMe3CbZybNuaYj', 'GKCBVW0xlrlxvXFsDeaL']) {
    const d = await db.collection(Collections.NEWS).doc(id).get()
    const x = d.data() || {}
    console.log(
      'detail',
      JSON.stringify(
        {
          id,
          status: x.status,
          categoryId: x.categoryId,
          category: x.category,
          publishedAt: x.publishedAt,
          publishedAtType: typeof x.publishedAt,
          authorId: x.authorId,
          authorUsername: x.authorUsername,
          aiEditorId: x.aiEditorId,
          slug: x.slug,
          source: x.source,
        },
        null,
        2
      )
    )
  }

  for (const cat of ['siyaset', 'yerel-haber', 'cevre-iklim']) {
    const snap = await db
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .where('categoryId', '==', cat)
      .orderBy('publishedAt', 'desc')
      .limit(8)
      .get()
    console.log(
      'cat_' + cat,
      snap.docs.map((d) => ({
        id: d.id,
        title: String(d.data().title || '').slice(0, 40),
        authorId: d.data().authorId,
        publishedAt: d.data().publishedAt,
      }))
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
