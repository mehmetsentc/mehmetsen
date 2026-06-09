import { auth } from '@/lib/firebase/auth'
'use client'

import { useState, useRef, useCallback } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import {
  Bot, Sparkles, RefreshCw, Tag, Search, TrendingUp,
  Copy, Check, Wand2, FileText, Loader2, ChevronRight, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'

type AiMode = 'create' | 'rewrite' | 'seo' | 'tags' | 'headline' | 'trends'

interface AiResult {
  title?: string
  spot?: string
  summary?: string
  content?: string
  seoTitle?: string
  seoDescription?: string
  tags?: string[]
  headlines?: string[]
  trends?: string[]
  category?: string
}

const MODES: { id: AiMode; label: string; icon: React.ComponentType<{className?: string}>; description: string }[] = [
  { id: 'create', label: 'Haber Oluştur', icon: FileText, description: 'Konudan veya URL\'den tam haber yaz' },
  { id: 'rewrite', label: 'Yeniden Yaz', icon: RefreshCw, description: 'Mevcut haberi editör standartlarında yeniden yaz' },
  { id: 'seo', label: 'SEO Üret', icon: Search, description: 'SEO başlığı ve meta açıklama oluştur' },
  { id: 'tags', label: 'Etiket Üret', icon: Tag, description: 'Haber için optimal etiket seti oluştur' },
  { id: 'headline', label: 'Manşet Öner', icon: Sparkles, description: 'Alternatif manşet seçenekleri üret' },
  { id: 'trends', label: 'Trend Konular', icon: TrendingUp, description: 'Güncel Türkiye trend konularını listele' },
]

async function callAiAssistant(mode: AiMode, input: string, idToken: string): Promise<AiResult> {
  const res = await fetch('/api/admin/ai-assist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ mode, input }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as {error?: string}).error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<AiResult>
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={copy} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))]">
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Kopyalandı' : 'Kopyala'}
    </button>
  )
}

function ResultBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">{label}</span>
        <CopyButton text={value} />
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[rgb(var(--color-text))]">{value}</p>
    </div>
  )
}

export default function AiNewsAssistantPage() {
  const { user } = useAuth()
  const [mode, setMode] = useState<AiMode>('create')
  const [input, setInput] = useState('')
  const [result, setResult] = useState<AiResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!input.trim() && mode !== 'trends') {
      toast.error('Lütfen bir girdi girin')
      return
    }
    if (!user) { toast.error('Giriş yapmalısınız'); return }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const token = await auth.currentUser?.getIdToken() ?? ''
      const res = await callAiAssistant(mode, input, token)
      setResult(res)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI servisi kullanılamıyor'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const currentMode = MODES.find(m => m.id === mode)!

  return (
    <div className="flex flex-col">
      <CMSHeader
        title="AI Haber Asistanı"
        subtitle="NaHaber Yapay Zeka Editör Sistemi"
      />

      <div className="p-6">
        <div className="grid gap-6 xl:grid-cols-3">
          {/* Mode selector */}
          <div className="xl:col-span-1">
            <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] overflow-hidden">
              <div className="border-b border-[rgb(var(--color-border))] px-4 py-3">
                <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">AI Modu Seç</h2>
              </div>
              <div className="p-2">
                {MODES.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { setMode(m.id); setResult(null); setError(null) }}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-xl p-3 text-left transition-all',
                      mode === m.id
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]'
                    )}
                  >
                    <m.icon className={cn('mt-0.5 h-4 w-4 shrink-0', mode === m.id ? 'text-white' : 'text-blue-600')} />
                    <div>
                      <p className="text-sm font-semibold">{m.label}</p>
                      <p className={cn('mt-0.5 text-xs', mode === m.id ? 'text-blue-100' : 'text-[rgb(var(--color-muted))]')}>{m.description}</p>
                    </div>
                    {mode === m.id && <ChevronRight className="ml-auto mt-0.5 h-4 w-4 text-blue-100" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Input + Result */}
          <div className="xl:col-span-2 space-y-4">
            {/* Input panel */}
            <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-4 py-3">
                <currentMode.icon className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">{currentMode.label}</h2>
              </div>
              <div className="p-4 space-y-3">
                {mode !== 'trends' && (
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                      {mode === 'create' ? 'Konu veya URL' :
                       mode === 'rewrite' ? 'Yeniden yazılacak metin' :
                       mode === 'seo' ? 'Haber başlığı veya içeriği' :
                       mode === 'tags' ? 'Haber içeriği' :
                       'Haber başlığı veya konusu'}
                    </label>
                    <textarea
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      rows={6}
                      placeholder={
                        mode === 'create' ? 'Örn: İstanbul\'da yeni metro hattı açıldı...' :
                        mode === 'rewrite' ? 'Yeniden yazılacak haber metnini buraya yapıştırın...' :
                        mode === 'seo' ? 'Haber başlığını veya özetini girin...' :
                        mode === 'tags' ? 'Haber içeriğini yapıştırın...' :
                        'Haber konusunu veya mevcut başlığı girin...'
                      }
                      className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3 text-sm text-[rgb(var(--color-text))] placeholder-[rgb(var(--color-muted))] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                    />
                    <p className="mt-1 text-right text-xs text-[rgb(var(--color-muted))]">{input.length} karakter</p>
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />AI işliyor...</>
                  ) : (
                    <><Wand2 className="h-4 w-4" />{currentMode.label}</>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/10">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] overflow-hidden">
                <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-4 py-3">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">AI Çıktısı</h2>
                </div>
                <div className="p-4 space-y-3">
                  {result.title && <ResultBlock label="Manşet" value={result.title} />}
                  {result.spot && <ResultBlock label="Haber Girişi (Spot)" value={result.spot} />}
                  {result.summary && <ResultBlock label="Özet" value={result.summary} />}
                  {result.content && <ResultBlock label="Haber İçeriği" value={result.content} />}
                  {result.seoTitle && <ResultBlock label="SEO Başlığı" value={result.seoTitle} />}
                  {result.seoDescription && <ResultBlock label="SEO Açıklaması" value={result.seoDescription} />}
                  {result.tags && result.tags.length > 0 && (
                    <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Etiketler</span>
                        <CopyButton text={result.tags.join(', ')} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {result.tags.map(tag => (
                          <span key={tag} className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.headlines && result.headlines.length > 0 && (
                    <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
                      <span className="mb-3 block text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Alternatif Manşetler</span>
                      <div className="space-y-2">
                        {result.headlines.map((h, i) => (
                          <div key={i} className="flex items-center justify-between gap-3 rounded-lg bg-[rgb(var(--color-card))] px-3 py-2">
                            <span className="text-sm text-[rgb(var(--color-text))]">{h}</span>
                            <CopyButton text={h} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.trends && result.trends.length > 0 && (
                    <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
                      <span className="mb-3 block text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Trend Konular</span>
                      <div className="space-y-2">
                        {result.trends.map((t, i) => (
                          <div key={i} className="flex items-center gap-3 rounded-lg bg-[rgb(var(--color-card))] px-3 py-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{i + 1}</span>
                            <span className="text-sm text-[rgb(var(--color-text))]">{t}</span>
                            <CopyButton text={t} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
