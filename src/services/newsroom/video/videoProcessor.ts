/**
 * Video Queue Processor
 * Picks up pending items from videoQueue, generates AI script,
 * stores results back to Firestore.
 *
 * VIDEO GENERATION PIPELINE:
 *   videoQueue (pending)
 *     → AI Script (GPT-4o-mini)
 *     → TTS voiceText (Google TTS / ElevenLabs — wired in route when keys available)
 *     → Thumbnail generation prompt stored (image gen called externally or skipped)
 *     → videos collection updated with script + metadata
 *     → news collection updated with videoScript field
 *     → videoQueue item marked done
 */

import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { generateVideoScript, fallbackVideoScript, type VideoScript } from './videoScriptGenerator'
import { generateTtsAudio } from './ttsGenerator'

const BATCH_SIZE = 5  // Process up to 5 videos per cron run (avoids timeout)
const MAX_DURATION_MS = 250_000  // 250s hard limit per run

interface QueueItem {
  id: string
  newsId: string
  title: string
  summary: string
  spot?: string
  content?: string
  categoryId: string
  coverImageUrl?: string
  priority: number
  createdAt: number
}

export interface VideoProcessorResult {
  processed: number
  failed: number
  skipped: number
  videosCreated: number
}

export async function processVideoQueue(): Promise<VideoProcessorResult> {
  const db = getAdminFirestore()
  const startMs = Date.now()
  const result: VideoProcessorResult = { processed: 0, failed: 0, skipped: 0, videosCreated: 0 }

  // Pick up highest-priority pending items
  const queueSnap = await db
    .collection('videoQueue')
    .where('status', '==', 'pending')
    .orderBy('priority', 'desc')
    .orderBy('createdAt', 'asc')
    .limit(BATCH_SIZE)
    .get()

  if (queueSnap.empty) {
    console.log('[videoProcessor] queue empty')
    return result
  }

  for (const queueDoc of queueSnap.docs) {
    if (Date.now() - startMs > MAX_DURATION_MS) {
      console.warn('[videoProcessor] approaching timeout, stopping early')
      break
    }

    const item = { id: queueDoc.id, ...queueDoc.data() } as QueueItem

    // Mark as processing to prevent double-pick
    await queueDoc.ref.update({ status: 'processing', processingStartedAt: Date.now() })

    try {
      // Fetch full article content if not already in queue
      let content = item.content
      let spot = item.spot
      if (!content && item.newsId) {
        const newsDoc = await db.collection(Collections.NEWS).doc(item.newsId).get()
        if (newsDoc.exists) {
          const data = newsDoc.data()!
          content = data.content as string | undefined
          spot = data.spot as string | undefined
        }
      }

      // Generate AI video script
      let script: VideoScript | null = await generateVideoScript({
        title: item.title,
        spot,
        summary: item.summary,
        content,
        categoryId: item.categoryId,
      })

      // Fall back if AI unavailable
      if (!script) {
        script = fallbackVideoScript({ title: item.title, spot, summary: item.summary, categoryId: item.categoryId })
      }

      const now = Date.now()

      // Generate TTS audio from voiceText (non-blocking — null if API key missing)
      // We create the Firestore doc first with a placeholder, then update with audioUrl
      const tempVideoId = `${item.newsId}_${now}`
      const ttsResult = await generateTtsAudio(script.voiceText, tempVideoId)

      // Build video document for the videos collection (TikTok feed)
      const videoDoc = {
        newsId: item.newsId,
        title: script.videoTitle,
        description: script.videoDescription,
        voiceText: script.voiceText,
        videoScript: JSON.stringify(script.segments),
        thumbnailPrompt: script.thumbnailPrompt,
        hashtags: script.hashtags,
        durationSeconds: script.durationSeconds,
        // Audio from Google TTS (populated when API key is set)
        audioUrl: ttsResult?.audioUrl ?? '',
        audioStoragePath: ttsResult?.storagePath ?? '',
        // Video URL: empty until actual video generation step
        videoUrl: '',
        thumbnailUrl: item.coverImageUrl ?? '',
        coverImageUrl: item.coverImageUrl ?? '',
        // Metadata
        categoryId: item.categoryId,
        // 'audio_ready' when TTS succeeded, 'draft' otherwise
        status: ttsResult ? 'audio_ready' : 'draft',
        scriptReady: true,
        audioReady: Boolean(ttsResult),
        mediaReady: false,
        likes: 0,
        views: 0,
        comments: 0,
        saves: 0,
        createdAt: now,
        publishedAt: now,
        source: 'ai_factory',
      }

      // Write to videos collection
      const videoRef = await db.collection(Collections.VIDEOS).add(videoDoc)

      // Update original news article with video script metadata
      await db.collection(Collections.NEWS).doc(item.newsId).update({
        videoScript: script.voiceText.slice(0, 500),
        videoScriptFull: JSON.stringify(script),
        videoTitle: script.videoTitle,
        videoId: videoRef.id,
        audioUrl: ttsResult?.audioUrl ?? '',
        videoQueued: false,
        videoProcessedAt: now,
      })

      // Mark queue item as done
      await queueDoc.ref.update({
        status: 'done',
        videoId: videoRef.id,
        completedAt: now,
        durationMs: Date.now() - startMs,
      })

      result.processed++
      result.videosCreated++
      console.log(`[videoProcessor] ✓ ${item.title.slice(0, 60)} → video/${videoRef.id}`)

    } catch (err) {
      console.error('[videoProcessor] failed item', item.id, err)
      await queueDoc.ref.update({
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
        failedAt: Date.now(),
      })
      result.failed++
    }
  }

  console.log(`[videoProcessor] done:`, result)
  return result
}
