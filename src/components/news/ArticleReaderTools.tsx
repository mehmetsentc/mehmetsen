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
  contentSelector?: string
}

/**
 * ArticleReaderTools
 *
 * Mobil  → FAB (bottom nav üstünde) + bottom sheet (tam genişlik)
 * Masaüstü → FAB (sağ-alt) + floating kart (mevcut tasarım)
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
  // Hide the floating tools near the page foot so they don't cover the
  // like/share/save actions and related rails at the end of the article.
  const [nearBottom, setNearBottom] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null)

  // ── Font size persist ─────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FONT_SIZE_STORAGE_KEY) as FontSize | null
      if (stored && (['sm', 'md', 'lg', 'xl'] as const).includes(stored)) {
        setFontSize(stored)
      }
    } catch { /* private mode */ }
  }, [])

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(contentSelector)
    if (!root) return
    Object.values(FONT_SIZE_CLS).forEach((cls) =>
      cls.split(/\s+/).forEach((c) => root.classList.remove(c))
    )
    FONT_SIZE_CLS[fontSize].split(/\s+/).forEach((c) => root.classList.add(c))
  }, [fontSize, contentSelector])

  const changeFont = useCallback((next: FontSize) => {
    setFontSize(next)
    try { localStorage.setItem(FONT_SIZE_STORAGE_KEY, next) } catch { /* ignore */ }
  }, [])

  // ── Ses ──────────────────────────────────────────────────────────
  const hasAudio = Boolean(post.audioUrl && post.audioReady !== false)

  const startMp3 = useCallback(() => {
    if (!post.audioUrl) return
    if (!audioRef.current) {
      audioRef.current = new Audio(post.audioUrl)
      audioRef.current.preload = 'metadata'
      audioRef.current.onended = () => setPlaying(false)
      audioRef.current.onpause = () => setPlaying(false)
      audioRef.current.onplay = () => setPlaying(true)
      audioRef.current.onerror = () => { setPlaying(false); setAudioReady(false) }
    }
    audioRef.current.play()
      .then(() => { setPlaying(true); setAudioReady(true) })
      .catch(() => setPlaying(false))
  }, [post.audioUrl])

  const pauseMp3 = useCallback(() => { audioRef.current?.pause(); setPlaying(false) }, [])

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
    if (playing) { usingTTS ? stopTTS() : pauseMp3(); return }
    if (hasAudio) { startMp3(); setUsingTTS(false) } else { startTTS() }
  }, [playing, usingTTS, hasAudio, startMp3, pauseMp3, startTTS, stopTTS])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  // ── FAB'ı sayfa sonunda gizle ─────────────────────────────────────
  useEffect(() => {
    let raf = 0
    const check = () => {
      raf = 0
      const doc = document.documentElement
      const reachedEnd = window.innerHeight + window.scrollY >= doc.scrollHeight - 220
      setNearBottom(reachedEnd)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check)
    }
    check()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  // ── Paylaşılan panel içeriği ──────────────────────────────────────
  const PanelContent = (
    <>
      {/* Dinle */}
      <section className="border-b border-[rgb(var(--color-border))] px-4 py-3">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-[rgb(var(--color-text-secondary))]">
          <Headphones className="h-3.5 w-3.5" />
          Dinle
          {!hasAudio && (
            <span className="ml-auto text-[10px] font-medium text-[rgb(var(--color-muted))]">
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

      {/* Yazı boyutu */}
      <section className="border-b border-[rgb(var(--color-border))] px-4 py-3">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-[rgb(var(--color-text-secondary))]">
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
                  : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-secondary))] hover:border-[rgb(var(--color-border-strong))]'
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
        <p className="mb-2 text-xs font-semibold text-[rgb(var(--color-text-secondary))]">Tema</p>
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { id: 'light', label: 'Açık', icon: <Sun className="h-3.5 w-3.5" /> },
              { id: 'dark',  label: 'Koyu', icon: <Moon className="h-3.5 w-3.5" /> },
              { id: 'oled',  label: 'OLED', icon: <Moon className="h-3.5 w-3.5 fill-current" /> },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-medium transition-colors',
                theme === t.id
                  ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-300'
                  : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-secondary))] hover:border-[rgb(var(--color-border-strong))]'
              )}
              aria-pressed={theme === t.id}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </section>
    </>
  )

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════
          MOBİL TASARIM  (lg:hidden)
          FAB → bottom nav üstünde
          Panel → bottom sheet
      ═══════════════════════════════════════════════════════════ */}
      <div className={cn('lg:hidden', nearBottom && !open && 'pointer-events-none')}>
        {/* FAB — bottom nav'ın tam üstünde; sayfa sonunda gizlenir */}
        <div
          className={cn(
            'fixed right-4 z-[110] flex items-center gap-2 transition-opacity duration-200',
            nearBottom && !open ? 'opacity-0' : 'opacity-100'
          )}
          style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
          aria-hidden={nearBottom && !open}
        >
          {/* Dinle FAB — panel kapalıyken göster */}
          <AnimatePresence>
            {!open && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                type="button"
                onClick={togglePlay}
                aria-label={playing ? 'Duraklat' : 'Haberi dinle'}
                className={cn(
                  'flex h-11 items-center gap-2 rounded-full px-4 shadow-lg shadow-black/30 transition-colors',
                  playing
                    ? 'bg-brand-500 text-white'
                    : 'bg-zinc-900 text-white'
                )}
              >
                {playing ? <Pause className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
                <span className="text-sm font-semibold">{playing ? 'Dinleniyor' : 'Dinle'}</span>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Ayarlar FAB */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Kapat' : 'Okuma araçları'}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-full shadow-lg shadow-black/30',
              open ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-white'
            )}
          >
            {open ? <X className="h-5 w-5" /> : <Settings2 className="h-5 w-5" />}
          </motion.button>
        </div>

        {/* Bottom Sheet */}
        <AnimatePresence>
          {open && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[108] bg-black/50 backdrop-blur-sm"
                onClick={() => setOpen(false)}
                aria-hidden
              />

              {/* Sheet */}
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 z-[109] overflow-hidden rounded-t-3xl bg-[rgb(var(--color-card))] shadow-2xl"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
              >
                {/* Drag handle */}
                <div className="flex justify-center pb-1 pt-3">
                  <div className="h-1 w-10 rounded-full bg-[rgb(var(--color-border))]" />
                </div>

                {/* Başlık */}
                <div className="flex items-center justify-between px-5 pb-2 pt-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-[rgb(var(--color-muted))]">
                    Okuma Araçları
                  </p>
                  <button
                    type="button"
                    aria-label="Kapat"
                    onClick={() => setOpen(false)}
                    className="rounded-full p-1.5 text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {PanelContent}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          MASAÜSTÜ TASARIM  (hidden lg:flex)
          FAB sağ-alt + floating kart (orijinal davranış)
      ═══════════════════════════════════════════════════════════ */}
      <div className="fixed bottom-6 right-4 z-overlay hidden flex-col items-end gap-2 lg:flex">
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-64 overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-2xl"
            >
              <header className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--color-muted))]">
                  Okuma Araçları
                </p>
                <button
                  type="button"
                  aria-label="Kapat"
                  onClick={() => setOpen(false)}
                  className="rounded-full p-1 text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>
              {PanelContent}
            </motion.div>
          )}
        </AnimatePresence>

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
                'flex h-12 items-center gap-2 rounded-full px-4 shadow-lg shadow-black/30 transition-colors',
                playing
                  ? 'bg-brand-500 text-white shadow-brand'
                  : 'bg-zinc-900 text-white hover:bg-zinc-800'
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
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full shadow-lg shadow-black/30 transition-transform hover:scale-105',
              open ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-white'
            )}
          >
            {open ? <X className="h-5 w-5" /> : <Settings2 className="h-5 w-5" />}
          </motion.button>
        </div>
      </div>
    </>
  )
}
