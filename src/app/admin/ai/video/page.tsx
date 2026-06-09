import { auth } from '@/lib/firebase/auth'
'use client'

import { useState } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { Video, Wand2, Copy, Check, Loader2, Sparkles, Film, Mic, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'

type ScriptType = 'news_report' | 'breaking' | 'analysis' | 'interview' | 'social_short'

const SCRIPT_TYPES: { id: ScriptType; label: string; duration: string; description: string }[] = [
  { id: 'news_report', label: 'Haber Bülteni', duration: '60-90 sn', description: 'Klasik TV haber formatı' },
  { id: 'breaking', label: 'Son Dakika', duration: '30-45 sn', description: 'Acil haber bülten formatı' },
  { id: 'analysis', label: 'Haber Analizi', duration: '2-3 dk', description: 'Derinlemesine analiz formatı' },
  { id: 'interview', label: 'Röportaj Soruları', duration: '5-10 dk', description: 'Uzman röportaj soruları' },
  { id: 'social_short', label: 'Sosyal Medya', duration: '15-30 sn', description: 'TikTok/Reels kısa video' },
]

interface VideoScript {
  title: string
  intro: string
  segments: { label: string; text: string; duration?: string }[]
  outro: string
  notes?: string
  hashtags?: string[]
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Kopyalandı' : 'Kopyala'}
    </button>
  )
}

export default function AiVideoAssistantPage() {
  const { user } = useAuth()
  const [scriptType, setScriptType] = useState<ScriptType>('news_report')
  const [topic, setTopic] = useState('')
  const [newsContent, setNewsContent] = useState('')
  const [tone, setTone] = useState<'formal' | 'conversational' | 'urgent'>('formal')
  const [script, setScript] = useState<VideoScript | null>(null)
  const [loading, setLoading] = useState(false)

  const handleGenerate = async () => {
    if (!topic.trim()) { toast.error('Konu girin'); return }
    if (!user) { toast.error('Giriş yapın'); return }

    setLoading(true)
    setScript(null)
    try {
      const token = await auth.currentUser?.getIdToken() ?? ''
      const res = await fetch('/api/admin/ai-video-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scriptType, topic, newsContent, tone }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as VideoScript
      setScript(data)
    } catch (err) {
      toast.error('Script oluşturulamadı')
    } finally {
      setLoading(false)
    }
  }

  const fullScript = script ? [
    script.intro,
    ...script.segments.map(s => `[${s.label}]\n${s.text}`),
    script.outro,
  ].join('\n\n') : ''

  return (
    <div className="flex flex-col">
      <CMSHeader title="AI Video Asistanı" subtitle="Video script ve içerik üretici" />
      <div className="p-6">
        <div className="grid gap-6 xl:grid-cols-3">
          {/* Settings */}
          <div className="xl:col-span-1 space-y-4">
            {/* Script type */}
            <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] overflow-hidden">
              <div className="border-b border-[rgb(var(--color-border))] px-4 py-3">
                <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">Script Türü</h2>
              </div>
              <div className="p-2">
                {SCRIPT_TYPES.map(st => (
                  <button key={st.id} onClick={() => setScriptType(st.id)}
                    className={cn('flex w-full items-start gap-3 rounded-xl p-3 text-left transition-all',
                      scriptType === st.id ? 'bg-purple-600 text-white' : 'hover:bg-[rgb(var(--color-surface))]'
                    )}>
                    <Film className={cn('mt-0.5 h-4 w-4 shrink-0', scriptType === st.id ? 'text-white' : 'text-purple-600')} />
                    <div>
                      <p className="text-sm font-semibold">{st.label}</p>
                      <div className={cn('mt-0.5 flex items-center gap-2 text-xs', scriptType === st.id ? 'text-purple-100' : 'text-[rgb(var(--color-muted))]')}>
                        <Clock className="h-3 w-3" />{st.duration} · {st.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Tone */}
            <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Ton</p>
              <div className="grid grid-cols-3 gap-2">
                {([['formal', 'Resmi'], ['conversational', 'Samimi'], ['urgent', 'Acil']] as [typeof tone, string][]).map(([t, label]) => (
                  <button key={t} onClick={() => setTone(t)}
                    className={cn('rounded-lg py-2 text-xs font-bold transition-colors',
                      tone === t ? 'bg-purple-600 text-white' : 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]'
                    )}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Input + Output */}
          <div className="xl:col-span-2 space-y-4">
            <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] overflow-hidden">
              <div className="border-b border-[rgb(var(--color-border))] px-4 py-3">
                <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">Script Girdisi</h2>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Konu / Ana Başlık *</label>
                  <input
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="Örn: Türkiye'nin yeni ekonomi paketi"
                    className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] placeholder-[rgb(var(--color-muted))] focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Haber İçeriği (isteğe bağlı)</label>
                  <textarea
                    value={newsContent}
                    onChange={e => setNewsContent(e.target.value)}
                    rows={4}
                    placeholder="Script'e kaynak olacak haber metni..."
                    className="w-full resize-none rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3 text-sm text-[rgb(var(--color-text))] placeholder-[rgb(var(--color-muted))] focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <button onClick={handleGenerate} disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-60">
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Script oluşturuluyor...</> : <><Wand2 className="h-4 w-4" />Video Script Oluştur</>}
                </button>
              </div>
            </div>

            {/* Script output */}
            {script && (
              <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] overflow-hidden">
                <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">{script.title}</h2>
                  </div>
                  <CopyBtn text={fullScript} />
                </div>
                <div className="p-4 space-y-4">
                  {/* Intro */}
                  <div className="rounded-xl border-l-4 border-purple-500 bg-purple-50 p-3 dark:bg-purple-900/10">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-purple-600">GİRİŞ</p>
                    <p className="text-sm leading-relaxed text-[rgb(var(--color-text))]">{script.intro}</p>
                  </div>

                  {/* Segments */}
                  {script.segments.map((seg, i) => (
                    <div key={i} className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">{seg.label}{seg.duration && ` · ${seg.duration}`}</span>
                        <CopyBtn text={seg.text} />
                      </div>
                      <p className="text-sm leading-relaxed text-[rgb(var(--color-text))]">{seg.text}</p>
                    </div>
                  ))}

                  {/* Outro */}
                  <div className="rounded-xl border-l-4 border-blue-500 bg-blue-50 p-3 dark:bg-blue-900/10">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-blue-600">KAPANIŞ</p>
                    <p className="text-sm leading-relaxed text-[rgb(var(--color-text))]">{script.outro}</p>
                  </div>

                  {/* Notes */}
                  {script.notes && (
                    <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-900/10">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-600">PRODÜKSIYON NOTU</p>
                      <p className="text-xs text-[rgb(var(--color-muted))]">{script.notes}</p>
                    </div>
                  )}

                  {/* Hashtags */}
                  {script.hashtags && script.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {script.hashtags.map(h => (
                        <span key={h} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          #{h}
                        </span>
                      ))}
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
