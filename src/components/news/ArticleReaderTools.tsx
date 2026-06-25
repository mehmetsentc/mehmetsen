'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ALargeSmall,
  Headphones,
  Moon,
  Pause,
  Play,
  Settings2,
  Sun,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useTheme } from '@/store/themeContext'
import { cn } from '@/lib/utils'
import type { Post } from '@/types/post'

type FontSize = 'sm' | 'md' | 'lg' | 'xl'

const FONT_SIZE_CLS: Record<FontSize, string> = {
  sm: 'text-[15px] leading-[1.75]',
  md: 'text-[17px] leading-[1.85]',
  lg: 'text-[19px] leading-[1.85]',
  xl: 'text-[22px] leading-[1.9]',
}

const FONT_SIZE_STORAGE_KEY = 'nahaber-article-font-size'

interface ArticleReaderToolsProps {
  post: Post
  /** Content selector — font-size override için */
  contentSelector?: string
}

/**
 * ArticleReaderTools — F2
 *
 * Sağ-alt floating toolbar. İçinde:
 *   - Dinle (Post.audioUrl varsa MP3, yoksa Web Speech API fallback)
 *   - Font size ayarı (4 seviye, localStorage'a yazar)
 *   - Tema değiştirme (light/dark/oled)
 *
 * Article body'ye yazı boyutu CSS class'ı uygular. Uygulama her sayfa
 * görüntülenmesinde stored boyut'tan başlar.
 */
export function ArticleReaderTools({
  post,
  contentSelector = '.news-body',
}: ArticleReaderToolsProps) {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [fontSize, setFontSize] = useState<FontSize>('md')
  const [playing, setPlaying] = useState(false)
  const [audioReady, setAudioReady] = useState(false)
  const [usingTTS, setUsingTTS] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null)

  // ── Font size persist ───────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FONT_SIZE_STORAGE_KEY) as FontSize | null
      if (stored && (['sm', 'md', 'lg', 'xl'] as const).includes(stored)) {
        setFontSize(stored)
      }
    } catch {
      /* private mode */
    }
  }, [])

  // Body'ye font size class'ını uygula (Tailwind class'larını override eder)
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(contentSelector)
    if (!root) return
    const classes = FONT_SIZE_CLS[fontSize].split(/\s+/)
    // Önce eski ölçüleri temizle
    Object.values(FONT_SIZE_CLS).forEach((cls) =>
      cls.split(/\s+/).forEach((c) => root.classList.remove(c))
    )
    classes.forEach((c) => root.classList.add(c))
  }, [fontSize, contentSelector])

  const changeFont = useCallback((next: FontSize) => {
    setFontSize(next)
    try {
      localStorage.setItem(FONT_SIZE_STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  // ── Dinleme: MP3 öncelikli, yoksa Web Speech ────────────────────
  const hasAudio = Boolean(post.audioUrl && post.audioReady !== false)

  const startMp3 = useCallback(() => {
    if (!post.audioUrl) return
    if (!audioRef.current) {
      audioRef.current = new Audio(post.audioUrl)
      audioRef.current.preload = 'metadata'
      audioRef.current.onended = () => setPlaying(false)
      audioRef.current.onpause = () => setPlaying(false)
      audioRef.current.onplay = () => setPlaying(true)
      audioRef.current.onerror = () => {
        setPlaying(false)
        setAudioReady(false)
      }
    }
    audioRef.current
      .play()
      .then(() => {
        setPlaying(true)
        setAudioReady(true)
      })
      .catch(() => {
        setPlaying(false)
      })
  }, [post.audioUrl])

  const pauseMp3 = useCallback(() => {
    audioRef.current?.pause()
    setPlaying(false)
  }, [])

  const startTTS = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const root = document.querySelector<HTMLElement>(contentSelector)
    const text = root?.innerText?.trim() || post.summary || post.title
    if (!text) return

    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'tr-TR'
    utter.rate = 1.0
    utter.pitch = 1.0
    utter.onend = () => setPlaying(false)
    utter.onerror = () => setPlaying(false)
    utterRef.current = utter
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utter)
    setPlaying(true)
    setUsingTTS(true)
  }, [contentSelector, post.summary, post.title])

  const stopTTS = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    setPlaying(false)
  }, [])

  const togglePlay = useCallback(() => {
    if (playing) {
      usingTTS ? stopTTS() : pauseMp3()
      return
    }
    if (hasAudio) {
      startMp3()
      setUsingTTS(false)
    } else {
      startTTS()
    }
  }, [playing, usingTTS, hasAudio, startMp3, pauseMp3, startTTS, stopTTS])

  // Cleanup
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  return (
    <div className="fixed bottom-6 right-4 z-overlay flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-64 overflow-hidden rounded-2xl border border-border bg-bg-card shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <p className="text-2xs font-bold uppercase tracking-widest text-text-tertiary">
                Okuma Araçları
              </p>
              <button
                type="button"
                aria-label="Kapat"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-text-tertiary hover:bg-bg-subtle"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {/* Dinle */}
            <section className="border-b border-border-subtle px-4 py-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-text-secondary">
                <Headphones className="h-3.5 w-3.5" />
                Dinle
                {!hasAudio && (
                  <span className="ml-auto text-2xs font-medium text-text-muted">
                    Tarayıcı sesi
                  </span>
                )}
              </p>
              <Button
                size="md"
                variant={playing ? 'soft' : 'solid'}
                fullWidth
                leftIcon={playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                onClick={togglePlay}
              >
                {playing ? 'Duraklat' : hasAudio ? 'Haberi dinle' : 'Sesli oku'}
              </Button>
            </section>

            {/* Font size */}
            <section className="border-b border-border-subtle px-4 py-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-text-secondary">
                <ALargeSmall className="h-3.5 w-3.5" />
                Yazı Boyutu
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {(['sm', 'md', 'lg', 'xl'] as const).map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => changeFont(s)}
                    className={cn(
                      'rounded-lg border py-1.5 text-center transition-colors',
                      fontSize === s
                        ? 'border-brand-500 bg-brand-500/10 font-bold text-brand-600 dark:text-brand-300'
                        : 'border-border bg-bg-subtle text-text-secondary hover:border-border-strong'
                    )}
                    aria-pressed={fontSize === s}
                    aria-label={`Yazı boyutu ${i + 1}`}
                  >
                    <span style={{ fontSize: 11 + i * 2 }}>A</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Tema */}
            <section className="px-4 py-3">
              <p className="mb-2 text-xs font-semibold text-text-secondary">Tema</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'light', label: 'Açık', icon: <Sun className="h-3.5 w-3.5" /> },
                    { id: 'dark', label: 'Koyu', icon: <Moon className="h-3.5 w-3.5" /> },
                    { id: 'oled', label: 'OLED', icon: <Moon className="h-3.5 w-3.5 fill-current" /> },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border py-2 text-2xs font-medium transition-colors',
                      theme === t.id
                        ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-300'
                        : 'border-border bg-bg-subtle text-text-secondary hover:border-border-strong'
                    )}
                    aria-pressed={theme === t.id}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB — Listen one-tap + Settings */}
      <div className="flex items-center gap-2">
        {!open && (
          <motion.button
            initial={false}
            animate={{ scale: 1 }}
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={togglePlay}
            aria-label={playing ? 'Duraklat' : 'Haberi dinle'}
            className={cn(
              'flex h-12 items-center gap-2 rounded-full px-4 shadow-lg backdrop-blur-md transition-colors',
              playing
                ? 'bg-brand-500 text-white shadow-brand'
                : 'bg-text-primary text-bg-base hover:opacity-90'
            )}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
            <span className="text-sm font-semibold">{playing ? 'Dinleniyor' : 'Dinle'}</span>
          </motion.button>
        )}

        <motion.button
          initial={false}
          whileTap={{ scale: 0.92 }}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Araçları kapat' : 'Okuma araçları'}
          aria-expanded={open}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-text-primary text-bg-base shadow-lg transition-transform hover:scale-105"
        >
          {open ? <X className="h-5 w-5" /> : <Settings2 className="h-5 w-5" />}
        </motion.button>
      </div>
    </div>
  )
}
