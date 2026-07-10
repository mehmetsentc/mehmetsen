'use client'

import { useCallback, useRef, useState } from 'react'
import { Headphones, Pause, Play } from 'lucide-react'
import type { Post } from '@/types/post'

interface ArticleAudioPlayerProps {
  post: Post
}

/** Inline audio player for articles with TTS audioUrl. */
export function ArticleAudioPlayer({ post }: ArticleAudioPlayerProps) {
  const [playing, setPlaying] = useState(false)
  const [ready, setReady] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const hasAudio = Boolean(post.audioUrl && post.audioReady !== false)
  if (!hasAudio) return null

  const toggle = useCallback(() => {
    if (!post.audioUrl) return
    if (!audioRef.current) {
      audioRef.current = new Audio(post.audioUrl)
      audioRef.current.preload = 'metadata'
      audioRef.current.onended = () => setPlaying(false)
      audioRef.current.onpause = () => setPlaying(false)
      audioRef.current.onplay = () => setPlaying(true)
      audioRef.current.oncanplay = () => setReady(true)
    }
    if (playing) {
      audioRef.current.pause()
    } else {
      void audioRef.current.play().catch(() => setPlaying(false))
    }
  }, [playing, post.audioUrl])

  return (
    <div
      className="mb-6 flex items-center gap-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-3"
      aria-label="Sesli okuma"
    >
      <Headphones className="h-5 w-5 shrink-0 text-[rgb(var(--color-brand))]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[rgb(var(--color-text))]">Sesli Dinle</p>
        <p className="text-xs text-[rgb(var(--color-muted))]">
          {ready ? 'Hazır' : 'Yükleniyor…'}
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] text-white transition-opacity hover:opacity-90"
        aria-label={playing ? 'Duraklat' : 'Oynat'}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-white" />}
      </button>
    </div>
  )
}
