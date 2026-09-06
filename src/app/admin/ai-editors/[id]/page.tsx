'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { auth } from '@/lib/firebase/auth'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { ArrowLeft, Loader2, Save, Play, Archive } from 'lucide-react'
import toast from 'react-hot-toast'
import type { AiEditorDocument, AiEditorPromptDocument, AiPromptType } from '@/types/aiEditor'
import type {
  HistoricalRetrievalResult,
  CanonicalMemoryCoverageStats,
} from '@/services/editorial/editorialMemoryTypes'
import { Search } from 'lucide-react'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const EXTRA_PROMPT_TYPES: AiPromptType[] = [
  'column',
  'analysis',
  'breaking',
  'seo',
  'review',
  'video',
  'source',
]

type TabId = 'style' | 'extra' | 'profile' | 'models' | 'sandbox' | 'memory'

export default function AiEditorDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const { can } = useCmsAuth()
  const canManage = can('editors:manage') || can('ai:configure')

  const [tab, setTab] = useState<TabId>('style')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editor, setEditor] = useState<AiEditorDocument | null>(null)
  const [prompts, setPrompts] = useState<Record<string, AiEditorPromptDocument | null>>({})
  const [coreDraft, setCoreDraft] = useState('')
  const [newsDraft, setNewsDraft] = useState('')
  const [extraType, setExtraType] = useState<AiPromptType>('column')
  const [extraDraft, setExtraDraft] = useState('')
  const [sandboxTitle, setSandboxTitle] = useState('Örnek haber başlığı')
  const [sandboxBody, setSandboxBody] = useState('Kaynak metin buraya…')
  const [sandboxTask, setSandboxTask] = useState<'news' | 'column'>('news')
  const [sandboxOut, setSandboxOut] = useState('')
  const [sandboxRunning, setSandboxRunning] = useState(false)

  // Faz A3 — Editorial Memory Manual Shadow Sandbox V1. Human-invoked only.
  // AI CALLS: 0. PROMPT INJECTION: OFF. No mutation of any kind.
  const [memoryHeadline, setMemoryHeadline] = useState('')
  const [memorySummary, setMemorySummary] = useState('')
  const [memoryCategoryId, setMemoryCategoryId] = useState('')
  const [memoryCitySlug, setMemoryCitySlug] = useState('')
  const [memoryDistrictSlug, setMemoryDistrictSlug] = useState('')
  const [memoryArticleId, setMemoryArticleId] = useState('')
  const [memorySlug, setMemorySlug] = useState('')
  const [memoryPublishedAt, setMemoryPublishedAt] = useState('')
  const [memoryResult, setMemoryResult] = useState<HistoricalRetrievalResult | null>(null)
  const [memoryRunning, setMemoryRunning] = useState(false)
  const [memoryCoverage, setMemoryCoverage] = useState<CanonicalMemoryCoverageStats | null>(null)
  const [memoryCoverageLoading, setMemoryCoverageLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/admin/ai-editors/${id}`, { headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as {
        editor: AiEditorDocument
        prompts: Record<string, AiEditorPromptDocument | null>
      }
      setEditor(data.editor)
      setPrompts(data.prompts ?? {})
      setCoreDraft(data.prompts?.core?.content ?? '')
      setNewsDraft(data.prompts?.news?.content ?? '')
    } catch {
      toast.error('Editör yüklenemedi')
      setEditor(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setExtraDraft(prompts[extraType]?.content ?? '')
  }, [extraType, prompts])

  const patch = async (body: Record<string, unknown>) => {
    if (!canManage) {
      toast.error('Yetkiniz yok')
      return
    }
    setSaving(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/admin/ai-editors/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { error?: string; editor?: AiEditorDocument }
      if (!res.ok) throw new Error(data.error || 'Kayıt başarısız')
      if (data.editor) setEditor(data.editor)
      toast.success('Kaydedildi')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata')
    } finally {
      setSaving(false)
    }
  }

  const savePrompt = async (promptType: AiPromptType, content: string) => {
    if (!canManage) return
    setSaving(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/admin/ai-editors/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setPrompt',
          promptType,
          content,
          changeReason: 'Admin karakter/tarz paneli',
        }),
      })
      const data = (await res.json()) as { error?: string; prompt?: AiEditorPromptDocument }
      if (!res.ok) throw new Error(data.error || 'Prompt kaydı başarısız')
      if (data.prompt) {
        setPrompts((prev) => ({ ...prev, [promptType]: data.prompt! }))
      }
      toast.success(`${promptType} v${data.prompt?.version ?? ''} kaydedildi — bundan sonraki haberlerde geçerli`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata')
    } finally {
      setSaving(false)
    }
  }

  const saveStyle = async () => {
    await savePrompt('core', coreDraft)
    await savePrompt('news', newsDraft)
  }

  const runSandbox = async () => {
    setSandboxRunning(true)
    setSandboxOut('')
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/admin/ai-editors/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sandbox',
          task: sandboxTask,
          sourceTitle: sandboxTitle,
          sourceBody: sandboxBody,
        }),
      })
      const data = (await res.json()) as {
        error?: string
        result?: Record<string, unknown> | null
        model?: string
        provider?: string
        durationMs?: number
      }
      if (!res.ok) throw new Error(data.error || 'Sandbox başarısız')
      const result = data.result
      const body =
        result == null
          ? '(boş)'
          : typeof result.error === 'string'
            ? `ERROR: ${result.error}`
            : JSON.stringify(result, null, 2)
      setSandboxOut(
        [`provider=${data.provider} model=${data.model} (${data.durationMs}ms)`, body].join('\n\n')
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sandbox hatası')
    } finally {
      setSandboxRunning(false)
    }
  }

  // Faz A3 Task 16 — read-only coverage probe. Distinguishes BAD MATCHING
  // from an EMPTY CANONICAL ARCHIVE. No AI call, no write.
  const loadMemoryCoverage = async () => {
    setMemoryCoverageLoading(true)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/editorial-memory/coverage', { headers })
      const data = (await res.json()) as { coverage?: CanonicalMemoryCoverageStats; error?: string }
      if (!res.ok) throw new Error(data.error || 'Kapsam sorgusu başarısız')
      setMemoryCoverage(data.coverage ?? null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kapsam sorgusu hatası')
    } finally {
      setMemoryCoverageLoading(false)
    }
  }

  // Faz A3 Task 12/13 — "Geçmişi Ara". Human-invoked, one explicit action.
  // No AI call. No publication. No mutation. No analytics/social event.
  const runMemorySearch = async () => {
    if (!memoryHeadline.trim()) {
      toast.error('Başlık gerekli')
      return
    }
    setMemoryRunning(true)
    setMemoryResult(null)
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/admin/ai-editors/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'memorySearch',
          article: {
            headline: memoryHeadline,
            summary: memorySummary || undefined,
            categoryId: memoryCategoryId || undefined,
            citySlug: memoryCitySlug || undefined,
            districtSlug: memoryDistrictSlug || undefined,
            articleId: memoryArticleId || undefined,
            slug: memorySlug || undefined,
            publishedAt: memoryPublishedAt || undefined,
          },
        }),
      })
      const data = (await res.json()) as HistoricalRetrievalResult & { error?: string }
      if (!res.ok) throw new Error(data.error || 'Hafıza araması başarısız')
      setMemoryResult(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hafıza araması hatası')
    } finally {
      setMemoryRunning(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-[rgb(var(--color-muted))]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Yükleniyor…
      </div>
    )
  }

  if (!editor) {
    return (
      <div className="p-6">
        <p className="text-sm text-[rgb(var(--color-muted))]">Editör bulunamadı.</p>
        <Link href="/admin/ai-editors" className="mt-2 inline-block text-sm text-[rgb(var(--color-primary))]">
          Listeye dön
        </Link>
      </div>
    )
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'style', label: 'Karakter & Tarz' },
    { id: 'extra', label: 'Diğer promptlar' },
    { id: 'profile', label: 'Profil' },
    { id: 'models', label: 'Modeller' },
    { id: 'sandbox', label: 'Önizleme' },
    { id: 'memory', label: 'Hafıza' },
  ]

  return (
    <div className="flex flex-col">
      <CMSHeader
        title={editor.name}
        subtitle={`${editor.title} · @${editor.slug} — talimat bir kez girilir, her haberde kullanılır`}
      />
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/ai-editors"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Liste
          </Link>
          <div className="ml-auto flex flex-wrap gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  tab === t.id
                    ? 'bg-[rgb(var(--color-primary))] text-white'
                    : 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'style' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-[rgb(var(--color-text))]">
              <p className="font-semibold">Tek seferlik tarz ayarı</p>
              <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
                Karakter (kimlik/ton) + Haber yazım kurallarını kaydedin. Bu editöre düşen her haber aynı
                üslupta yazılır. Ansiklopedik “Sonuç / …Önemi” makalesi istenmez — gazete ters piramidi.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-bold text-[rgb(var(--color-text))]">
                    Karakter / kimlik (core)
                  </label>
                  {prompts.core && (
                    <span className="text-[10px] text-[rgb(var(--color-muted))]">
                      v{prompts.core.version}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[rgb(var(--color-muted))]">
                  Kim bu editör? Ton, yasaklar, uzmanlık. Örn: “Sen İpek Demir’sin… insan odaklı, mekân
                  uydurma.”
                </p>
                <textarea
                  value={coreDraft}
                  onChange={(e) => setCoreDraft(e.target.value)}
                  disabled={!canManage}
                  rows={14}
                  className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 font-mono text-xs leading-relaxed"
                  placeholder="Sen … NaHaber … Editörü (AI). Ton: … Yasaklar: …"
                />
              </div>

              <div className="space-y-2 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-bold text-[rgb(var(--color-text))]">
                    Haber yazım tarzı (news)
                  </label>
                  {prompts.news && (
                    <span className="text-[10px] text-[rgb(var(--color-muted))]">
                      v{prompts.news.version}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[rgb(var(--color-muted))]">
                  Bu editör haberleri nasıl yazar? 5N1K, uzunluk, hangi ## başlıklar yasak…
                </p>
                <textarea
                  value={newsDraft}
                  onChange={(e) => setNewsDraft(e.target.value)}
                  disabled={!canManage}
                  rows={14}
                  className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 font-mono text-xs leading-relaxed"
                  placeholder="GAZETE HABERİ (ters piramit)… 250-450 kelime… Sonuç başlığı yasak…"
                />
              </div>
            </div>

            {canManage && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveStyle()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--color-primary))] px-4 py-2.5 text-sm font-semibold text-white"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Karakter & tarzı kaydet
              </button>
            )}
          </div>
        )}

        {tab === 'extra' && (
          <div className="space-y-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
            <div className="flex flex-wrap gap-1">
              {EXTRA_PROMPT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setExtraType(t)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                    extraType === t
                      ? 'bg-[rgb(var(--color-primary))] text-white'
                      : 'bg-black/[0.04] text-[rgb(var(--color-muted))]'
                  }`}
                >
                  {t}
                  {prompts[t] ? ` v${prompts[t]!.version}` : ''}
                </button>
              ))}
            </div>
            <textarea
              value={extraDraft}
              onChange={(e) => setExtraDraft(e.target.value)}
              disabled={!canManage}
              rows={14}
              className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 font-mono text-xs leading-relaxed"
            />
            {canManage && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void savePrompt(extraType, extraDraft)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--color-primary))] px-3 py-2 text-xs font-semibold text-white"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {extraType} kaydet
              </button>
            )}
          </div>
        )}

        {tab === 'profile' && (
          <div className="space-y-4 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
            <Field
              label="Kısa bio"
              value={editor.shortBio}
              onChange={(v) => setEditor({ ...editor, shortBio: v })}
              disabled={!canManage}
            />
            <Field
              label="Bio"
              value={editor.bio}
              onChange={(v) => setEditor({ ...editor, bio: v })}
              disabled={!canManage}
              multiline
            />
            <Field
              label="Köşe adı"
              value={editor.columnName ?? ''}
              onChange={(v) => setEditor({ ...editor, columnName: v || null })}
              disabled={!canManage}
            />
            <div>
              <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">
                Yayın politikası
              </label>
              <select
                value={editor.publishPolicy}
                disabled={!canManage}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    publishPolicy: e.target.value as AiEditorDocument['publishPolicy'],
                  })
                }
                className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm"
              >
                <option value="AUTO_PUBLISH">AUTO_PUBLISH — hemen yayına al</option>
                <option value="REQUIRES_APPROVAL">REQUIRES_APPROVAL — (eski, yayın engellemez)</option>
                <option value="DRAFT_ONLY">DRAFT_ONLY — yalnızca taslak</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">
                Kategoriler (virgülle)
              </label>
              <input
                value={editor.categoryIds.join(', ')}
                disabled={!canManage}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    categoryIds: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm"
              />
            </div>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void patch({
                      shortBio: editor.shortBio,
                      bio: editor.bio,
                      columnName: editor.columnName,
                      publishPolicy: editor.publishPolicy,
                      categoryIds: editor.categoryIds,
                      capabilities: editor.capabilities,
                      status: editor.status,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--color-primary))] px-3 py-2 text-xs font-semibold text-white"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Profil kaydet
                </button>
                <button
                  type="button"
                  disabled={saving || editor.status === 'archived'}
                  onClick={() => void patch({ action: 'archive' })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-600"
                >
                  <Archive className="h-3.5 w-3.5" />
                  Arşivle
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'models' && (
          <div className="space-y-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5 text-sm">
            <p className="text-xs text-[rgb(var(--color-muted))]">
              Secrets env’de. Burada provider/model özeti.
            </p>
            {(['news', 'research', 'column', 'seo'] as const).map((task) => {
              const a = editor.modelAssignments?.[task]
              return (
                <div
                  key={task}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--color-border))] py-2 last:border-0"
                >
                  <span className="font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                    {task}
                  </span>
                  <span className="font-mono text-xs">
                    {a ? `${a.provider} / ${a.model}` : 'varsayılan (router)'}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'sandbox' && (
          <div className="space-y-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
            <p className="text-xs text-[rgb(var(--color-muted))]">
              Kayıtlı tarz ile önizleme — yayına yazılmaz.
            </p>
            <select
              value={sandboxTask}
              onChange={(e) => setSandboxTask(e.target.value === 'column' ? 'column' : 'news')}
              className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm"
            >
              <option value="news">news</option>
              <option value="column">column</option>
            </select>
            <input
              value={sandboxTitle}
              onChange={(e) => setSandboxTitle(e.target.value)}
              className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm"
              placeholder="Başlık"
            />
            <textarea
              value={sandboxBody}
              onChange={(e) => setSandboxBody(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={sandboxRunning}
              onClick={() => void runSandbox()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--color-primary))] px-3 py-2 text-xs font-semibold text-white"
            >
              {sandboxRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Bu tarzla dene
            </button>
            {sandboxOut && (
              <pre className="max-h-[420px] overflow-auto rounded-lg bg-black/[0.04] p-3 text-xs whitespace-pre-wrap">
                {sandboxOut}
              </pre>
            )}
          </div>
        )}

        {tab === 'memory' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-xs font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200">
              EDITORIAL MEMORY · MANUAL SHADOW · AI CALLS: 0 · PROMPT INJECTION: OFF
            </div>

            <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Canonical Hafıza Kapsamı</h3>
                <button
                  type="button"
                  onClick={() => void loadMemoryCoverage()}
                  disabled={memoryCoverageLoading}
                  className="rounded-lg border border-[rgb(var(--color-border))] px-2.5 py-1 text-xs font-medium"
                >
                  {memoryCoverageLoading ? 'Yükleniyor…' : 'Kapsamı yükle'}
                </button>
              </div>
              {!memoryCoverage && !memoryCoverageLoading && (
                <p className="text-xs text-[rgb(var(--color-muted))]">
                  Postgres canonical arşivinde ne kadar geçmiş haber olduğunu görmek için yükleyin. Bu, kötü
                  eşleştirme ile boş arşivi ayırt etmek için gerekli.
                </p>
              )}
              {memoryCoverage && (
                <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 md:grid-cols-6">
                  <Stat label="Toplam" value={memoryCoverage.total} />
                  <Stat label="Son 7g" value={memoryCoverage.last7d} />
                  <Stat label="Son 30g" value={memoryCoverage.last30d} />
                  <Stat label="Son 90g" value={memoryCoverage.last90d} />
                  <Stat label="Son 365g" value={memoryCoverage.last365d} />
                  <Stat label="365g+" value={memoryCoverage.olderThan365d} />
                  <div className="col-span-2 text-[rgb(var(--color-muted))] sm:col-span-3 md:col-span-6">
                    Aralık: {memoryCoverage.oldestPublishedAt?.slice(0, 10) ?? '—'} →{' '}
                    {memoryCoverage.newestPublishedAt?.slice(0, 10) ?? '—'}
                    {memoryCoverage.queryError ? ` · HATA: ${memoryCoverage.queryError}` : ''}
                    {!memoryCoverage.hasDatabaseUrl ? ' · DATABASE_URL yok' : ''}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
              <p className="text-xs text-[rgb(var(--color-muted))]">
                Gerçek, mevcut bir NaHaber haberini seçin/yapıştırın. Sadece Postgres canonical arşivde deterministik
                arama yapılır — AI çağrısı yok, prompt&apos;a eklenmez, hiçbir şey değişmez.
              </p>
              <input
                value={memoryHeadline}
                onChange={(e) => setMemoryHeadline(e.target.value)}
                className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm"
                placeholder="Başlık (zorunlu) — gerçek haberin başlığını yapıştırın"
              />
              <textarea
                value={memorySummary}
                onChange={(e) => setMemorySummary(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm"
                placeholder="Özet (opsiyonel)"
              />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <input
                  value={memoryCitySlug}
                  onChange={(e) => setMemoryCitySlug(e.target.value)}
                  className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm"
                  placeholder="Şehir slug"
                />
                <input
                  value={memoryDistrictSlug}
                  onChange={(e) => setMemoryDistrictSlug(e.target.value)}
                  className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm"
                  placeholder="İlçe slug"
                />
                <input
                  value={memoryCategoryId}
                  onChange={(e) => setMemoryCategoryId(e.target.value)}
                  className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm"
                  placeholder="Kategori id"
                />
                <input
                  value={memoryPublishedAt}
                  onChange={(e) => setMemoryPublishedAt(e.target.value)}
                  className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm"
                  placeholder="Yayın tarihi (ISO, opsiyonel)"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={memoryArticleId}
                  onChange={(e) => setMemoryArticleId(e.target.value)}
                  className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm"
                  placeholder="Bu haberin id'si (kendisini hariç tutmak için, opsiyonel)"
                />
                <input
                  value={memorySlug}
                  onChange={(e) => setMemorySlug(e.target.value)}
                  className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm"
                  placeholder="Bu haberin slug'ı (opsiyonel)"
                />
              </div>
              <button
                type="button"
                disabled={memoryRunning}
                onClick={() => void runMemorySearch()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--color-primary))] px-3 py-2 text-xs font-semibold text-white"
              >
                {memoryRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Geçmişi Ara
              </button>
            </div>

            {memoryResult && memoryResult.results.length === 0 && (
              <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5 text-sm text-[rgb(var(--color-muted))]">
                Uygun canonical geçmiş haber bulunamadı.
                {memoryResult.noResultReason ? ` (${memoryResult.noResultReason})` : ''}
              </div>
            )}

            {memoryResult && memoryResult.results.length > 0 && (
              <div className="space-y-3">
                {memoryResult.results.map((r) => (
                  <div
                    key={r.articleId}
                    className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 text-sm"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{r.headline}</span>
                      <span className="rounded bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-mono">
                        {r.ageBucket}
                      </span>
                      <span className="rounded bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-mono">
                        {r.relationshipConfidence}
                      </span>
                      <span className="text-[10px] text-[rgb(var(--color-muted))]">
                        {r.publishedAt.slice(0, 10)}
                      </span>
                    </div>
                    {r.summary && (
                      <p className="mb-2 text-xs text-[rgb(var(--color-muted))]">{r.summary}</p>
                    )}
                    <p className="text-[11px] text-[rgb(var(--color-muted))]">
                      Neden eşleşti? {r.evidence.map((e) => e.labelTr).join(' · ')}
                    </p>
                    <p className="mt-1 text-[10px] font-mono text-[rgb(var(--color-muted))]">
                      score={r.retrievalScore} · {r.publicReadClass}/{r.trustTier}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-black/[0.03] p-2">
      <div className="text-[10px] uppercase tracking-wide text-[rgb(var(--color-muted))]">{label}</div>
      <div className="font-mono text-sm font-semibold">{value}</div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  disabled,
  multiline,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  multiline?: boolean
}) {
  const cls =
    'w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm'
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={5}
          className={cls}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cls}
        />
      )}
    </div>
  )
}
