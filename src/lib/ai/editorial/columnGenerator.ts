import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { listAiEditors } from '@/lib/ai/editorial/aiEditorService'
import { buildEditorPrompt } from '@/lib/ai/editorial/promptBuilder'
import { resolveModelForEditor, recordAiUsage } from '@/lib/ai/editorial/modelRouter'
import { authorFieldsFromEditor } from '@/lib/ai/editorial/editorRouter'
import { callDeepSeek } from '@/lib/ai/editorial/sandboxCall'
import { contentHasIncompleteSegments, titleLooksIncomplete } from '@/lib/ai/textCompleteness'
import { countPlainWords, MIN_NEWS_BODY_WORDS } from '@/lib/contentQuality'
import { buildBodyBlocksFromAi } from '@/lib/articleBlocksFromAi'
import { articleBlocksToPlainText } from '@/lib/articleBlocks'

function dayKey(ts = Date.now()): string {
  return new Date(ts).toISOString().slice(0, 10)
}

/**
 * Idempotent daily column generation for AI editors with columnEnabled.
 * Skips when nothing meaningful to write or already wrote today.
 */
export async function runDailyColumnGeneration(limit = 3): Promise<{
  attempted: number
  created: number
  skipped: string[]
}> {
  const editors = (await listAiEditors({ status: 'active' })).filter(
    (e) => e.capabilities.columnEnabled && e.columnName
  )
  const skipped: string[] = []
  let created = 0
  let attempted = 0
  const db = getAdminFirestore()
  const today = dayKey()

  for (const editor of editors.slice(0, limit)) {
    attempted++
    const fingerprint = `column:${editor.id}:${today}`
    const existing = await db
      .collection(Collections.NEWS_DRAFTS)
      .where('rssFingerprint', '==', fingerprint)
      .limit(1)
      .get()
    if (!existing.empty) {
      skipped.push(`${editor.slug}:already`)
      continue
    }

    // Pull a recent published news item in editor categories as context (optional)
    let contextTitle = ''
    let contextBody = ''
    if (editor.categoryIds[0]) {
      const newsSnap = await db
        .collection(Collections.NEWS)
        .where('status', '==', 'published')
        .where('categoryId', '==', editor.categoryIds[0])
        .orderBy('publishedAt', 'desc')
        .limit(1)
        .get()
      if (!newsSnap.empty) {
        const n = newsSnap.docs[0]!.data()
        contextTitle = String(n.title || '')
        contextBody = String(n.content || n.description || n.summary || '').slice(0, 3000)
      }
    }

    if (!contextTitle) {
      skipped.push(`${editor.slug}:no-story`)
      continue
    }

    const built = await buildEditorPrompt({
      editor,
      task: 'column',
      sourceTitle: contextTitle,
      sourceBody: contextBody,
      categoryId: editor.categoryIds[0],
      extraUserNotes:
        'Yalnızca gerçekten yazılmaya değer bir gündem varsa köşe yaz. Boş/genel laflar üretme. JSON döndür.',
    })
    const resolved = resolveModelForEditor(editor, 'column')
    const result = await callDeepSeek({
      system: built.system,
      user: built.user,
      model: resolved.model,
      telemetry: {
        agentName: 'column_generator',
        operation: 'generate_column',
        promptVersion: 'column-generator:v1',
      },
    })
    void recordAiUsage({
      editorId: editor.id,
      task: 'column',
      provider: resolved.provider,
      model: resolved.model,
      published: false,
    })

    if (!result || result.error) {
      skipped.push(`${editor.slug}:ai-fail`)
      continue
    }

    const title = String(result.title || '').trim()
    const content = String(result.content || '').trim()
    if (!title || countPlainWords(content) < MIN_NEWS_BODY_WORDS) {
      skipped.push(`${editor.slug}:thin`)
      continue
    }
    if (
      titleLooksIncomplete(title) ||
      contentHasIncompleteSegments(content) ||
      contentHasIncompleteSegments(String(result.spot || ''))
    ) {
      skipped.push(`${editor.slug}:incomplete`)
      continue
    }

    const authors = authorFieldsFromEditor(editor)
    const bodyBlocks = buildBodyBlocksFromAi({
      title,
      spot: String(result.spot || ''),
      summary: String(result.summary || ''),
      content,
    })
    const plain = articleBlocksToPlainText(bodyBlocks) || content
    const now = Date.now()

    await db.collection(Collections.NEWS_DRAFTS).add({
      title,
      spot: String(result.spot || ''),
      summary: String(result.summary || '').slice(0, 280),
      description: plain,
      content: plain,
      bodyBlocks,
      seoTitle: String(result.seoTitle || title).slice(0, 70),
      seoDescription: String(result.seoDescription || result.summary || '').slice(0, 165),
      ...authors,
      category: editor.categoryIds[0] || 'gundem',
      categoryId: editor.categoryIds[0] || 'gundem',
      articleFormat: 'column',
      articleLayout: 'longform',
      type: 'news',
      tags: ['kose-yazisi', editor.slug],
      draftStatus: 'pending_review',
      moderationReasons: ['ai_column_requires_approval'],
      aiGenerated: true,
      rssFingerprint: fingerprint,
      rssGuid: fingerprint,
      ingestionSourceId: `ai-column:${editor.id}`,
      sourceLabel: editor.columnName || editor.name,
      sourceUrl: '',
      originalTitle: title,
      ingestedAt: now,
      createdAt: now,
      updatedAt: now,
      editorId: 'national-news',
      editorType: 'national',
      confidenceScore: 70,
      thumbnail: '',
      coverImageUrl: '',
      videoUrl: '',
      city: '',
      district: '',
      citySlug: '',
      country: 'Türkiye',
      location: null,
    })
    created++
  }

  return { attempted, created, skipped }
}
