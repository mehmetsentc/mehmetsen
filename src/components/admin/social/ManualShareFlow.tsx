'use client'

/**
 * Manual multi-account share flow (Görev 18 EK) — one implementation for the
 * news list popover (desktop), the mobile share sheet and the composer:
 *
 *   1. pick: ComposerTargetPicker (checkboxes, nothing preselected)
 *   2. confirm: news + format + every target account listed explicitly
 *   3. send: one request → server validates EVERY target, runs them in
 *      bounded sequential rounds; each account has its own ledger lock
 *   4. results: one row per target (platform · hesap · biçim · sonuç · güvenli
 *      neden · dış gönderi kimliği). Only definite failures can be retried, and
 *      only those the operator ticks. Uncertain results go to their own flow.
 */
import { useState } from 'react'
import Link from 'next/link'
import { Loader2, RotateCcw, Send } from 'lucide-react'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import {
  describeTargetRow,
  isSafelyRetryable,
  OVERALL_HEADLINE,
  overallShareState,
  readJsonResponse,
  rowAsResult,
  unreadableResponseText,
  type ShareOverall,
  type TargetRowLike,
} from '@/lib/social/shareResultText'
import { showShareToast } from '@/lib/social/shareToast'
import {
  ComposerTargetPicker,
  EMPTY_TARGETS,
  explicitTargets,
  platformsOf,
  selectedLabels,
  targetCount,
  type TargetOption,
  type TargetPlatform,
  type TargetSelection,
} from './ComposerTargetPicker'

export type ShareMode = 'post' | 'story'

export type ManualShareResult = {
  ok: boolean
  status: number
  overall: ShareOverall | 'error'
  rows: TargetRowLike[]
  message: string | null
}

const CODE_TEXT: Record<string, string> = {
  target_required: 'Paylaşım için en az bir bağlı hesap seçin',
  too_many_targets: 'Tek seferde en çok 20 hedef (platform başına 10) seçilebilir',
  forbidden: 'Seçilen hesaplardan biriyle paylaşım yetkiniz yok',
  outside_location: 'Seçilen hesaplardan biri bu haberin konumu için kapsam dışında',
  outside_category: 'Seçilen hesaplardan biri bu haberin kategorisi için kapsam dışında',
  reconnect_required: 'Seçilen hesaplardan biri yeniden bağlantı istiyor',
  format_unsupported: 'Seçilen hesaplardan biri bu biçimi desteklemiyor',
  format_not_allowed: 'Seçilen hesaplardan birinde bu biçim kapsamda kapalı',
  bad_origin: 'İstek kaynağı doğrulanamadı; sayfayı yenileyin',
  not_found: 'Hedef hesap bulunamadı',
}

/** POST /api/admin/social/force-reshare with explicit multi-account targets. */
export async function sendManualShare(input: { newsId: string; mode: ShareMode; targets: TargetSelection; extra?: Record<string, unknown> }): Promise<ManualShareResult> {
  const sel: TargetSelection = input.mode === 'story' ? { ...input.targets, threads: [] } : input.targets
  if (targetCount(sel) === 0) return { ok: false, status: 400, overall: 'error', rows: [], message: CODE_TEXT.target_required }
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  let res: Response
  try {
    res = await fetch('/api/admin/social/force-reshare', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...(input.extra ?? {}), ids: [input.newsId], mode: input.mode, manual: true, force: false, platforms: platformsOf(sel), targets: explicitTargets(sel) }),
    })
  } catch {
    return { ok: false, status: 0, overall: 'error', rows: [], message: unreadableResponseText(0) }
  }
  const parsed = await readJsonResponse<{ error?: string; code?: string; platform?: string; accountId?: string; targetResults?: TargetRowLike[]; results?: Array<{ reason?: string }> }>(res)
  if (!parsed.ok) return { ok: false, status: parsed.status, overall: 'error', rows: [], message: unreadableResponseText(parsed.status) }
  const d = parsed.data
  const rows = d.targetResults ?? []
  if (!res.ok && rows.length === 0) {
    const base = (d.code && CODE_TEXT[d.code]) ?? d.error ?? d.results?.[0]?.reason ?? 'Paylaşım başarısız'
    return { ok: false, status: res.status, overall: 'error', rows, message: d.accountId ? `${base} (${d.accountId})` : base }
  }
  const overall = overallShareState(rows.map(rowAsResult))
  return { ok: overall === 'published' || overall === 'partial', status: res.status, overall, rows, message: d.error ?? null }
}

export function TargetResultList({ rows, retry, onToggleRetry }: { rows: TargetRowLike[]; retry?: string[]; onToggleRetry?: (key: string) => void }) {
  return (
    <ul className="space-y-1 text-[11px]" aria-label="Hedef sonuçları">
      {rows.map((r) => {
        const key = `${r.accountId}__${r.format}`
        const can = isSafelyRetryable(r)
        return (
          <li
            key={key}
            className={cn(
              'rounded-md px-2 py-1',
              r.success || r.code === 'already_published' ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
                : r.ledgerStatus === 'uncertain' || r.code === 'uncertain_previous_attempt' || r.code === 'time_budget' || r.code === 'not_attempted_after_error' ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
                  : 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100',
            )}
          >
            <label className={cn('flex items-start gap-1.5', can && onToggleRetry && 'cursor-pointer')}>
              {can && onToggleRetry ? <input type="checkbox" className="mt-0.5" checked={!!retry?.includes(key)} onChange={() => onToggleRetry(key)} aria-label="Bu hedefi yeniden dene" /> : null}
              <span>{describeTargetRow(r)}</span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

export function ManualShareFlow({
  newsId,
  newsTitle,
  mode,
  onClose,
  onFinished,
  compact = false,
}: {
  newsId: string
  newsTitle: string
  mode: ShareMode
  onClose: () => void
  onFinished?: (r: ManualShareResult) => void
  compact?: boolean
}) {
  const [stage, setStage] = useState<'pick' | 'confirm' | 'sending' | 'result'>('pick')
  const [targets, setTargets] = useState<TargetSelection>(EMPTY_TARGETS)
  const [options, setOptions] = useState<TargetOption[]>([])
  const [result, setResult] = useState<ManualShareResult | null>(null)
  const [retry, setRetry] = useState<string[]>([])
  const effective: TargetSelection = mode === 'story' ? { ...targets, threads: [] } : targets
  const count = targetCount(effective)
  const labels = selectedLabels(effective, options)

  const send = async (sel: TargetSelection) => {
    setStage('sending')
    const r = await sendManualShare({ newsId, mode, targets: sel })
    setResult(r)
    setRetry([])
    setStage('result')
    const lines = r.rows.map(describeTargetRow)
    if (r.overall === 'error') showShareToast('failed', [r.message ?? 'Paylaşım başarısız'])
    else showShareToast(r.overall, lines)
    onFinished?.(r)
  }

  const retrySelection = (): TargetSelection => {
    const sel: TargetSelection = { facebook: [], instagram: [], threads: [] }
    for (const row of result?.rows ?? []) {
      if (retry.includes(`${row.accountId}__${row.format}`) && isSafelyRetryable(row)) sel[row.platform as TargetPlatform].push(row.accountId)
    }
    return sel
  }

  return (
    <div className="space-y-2 text-xs">
      {stage === 'pick' && (
        <>
          <div className={cn('overflow-auto', compact ? 'max-h-80' : 'max-h-[55vh]')}>
            <ComposerTargetPicker newsId={newsId} mode={mode} value={targets} onChange={setTargets} onOptions={setOptions} />
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={count === 0}
              onClick={() => setStage('confirm')}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 font-bold text-white disabled:opacity-40"
            >
              {count === 0 ? 'Hesap seçin' : `Devam — ${count} hedef`}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-[rgb(var(--color-border))] px-2 py-1.5 font-bold text-[rgb(var(--color-muted))]">
              Vazgeç
            </button>
          </div>
        </>
      )}

      {stage === 'confirm' && (
        <div className="space-y-2" aria-label="Yayın onayı">
          <p className="font-bold text-[rgb(var(--color-text))]">Yayın onayı</p>
          <p>
            <span className="text-[rgb(var(--color-muted))]">Haber:</span> <b>{newsTitle}</b>
          </p>
          <p>
            <span className="text-[rgb(var(--color-muted))]">Biçim:</span> <b>{mode === 'story' ? 'Hikâye' : 'Görselli gönderi'}</b>
          </p>
          <div>
            <p className="text-[rgb(var(--color-muted))]">Hedef hesaplar ({count}):</p>
            <ul className="list-disc pl-4 font-semibold">
              {labels.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] text-[rgb(var(--color-muted))]">Her hesap ayrı yayımlanır; bir hesabın hatası diğerlerini etkilemez. Bu haber bir hesapta zaten yayımlandıysa o hesaba tekrar gönderilmez.</p>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => void send(effective)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 font-bold text-white">
              <Send className="h-3 w-3" aria-hidden /> {count} hesapta paylaş
            </button>
            <button type="button" onClick={() => setStage('pick')} className="rounded-lg border border-[rgb(var(--color-border))] px-2 py-1.5 font-bold text-[rgb(var(--color-muted))]">
              Geri
            </button>
          </div>
        </div>
      )}

      {stage === 'sending' && (
        <p className="flex items-center gap-1.5 text-[rgb(var(--color-muted))]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {count} hedefe sırayla gönderiliyor…
        </p>
      )}

      {stage === 'result' && result && (
        <div className="space-y-2" aria-label="Paylaşım sonucu">
          <p className={cn('font-bold', result.overall === 'published' ? 'text-emerald-700 dark:text-emerald-300' : result.overall === 'partial' || result.overall === 'uncertain' ? 'text-amber-700 dark:text-amber-300' : 'text-red-700 dark:text-red-300')}>
            {result.overall === 'error' ? result.message : OVERALL_HEADLINE[result.overall]}
          </p>
          {result.rows.length > 0 && (
            <TargetResultList rows={result.rows} retry={retry} onToggleRetry={(k) => setRetry((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))} />
          )}
          {result.rows.some((r) => r.ledgerStatus === 'uncertain' || r.code === 'uncertain_previous_attempt') && (
            <p className="text-[11px] text-amber-800 dark:text-amber-200">
              Belirsiz sonuçlar otomatik tekrar edilmez:{' '}
              <Link href="/admin/social/shares" className="font-semibold underline">
                Paylaşımlar → Sonucu belirsiz paylaşımlar
              </Link>
            </p>
          )}
          <div className="flex gap-1.5">
            {result.rows.some(isSafelyRetryable) && (
              <button
                type="button"
                disabled={retry.length === 0}
                onClick={() => void send(retrySelection())}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-blue-600 px-2.5 py-1.5 font-bold text-blue-700 disabled:opacity-40 dark:text-blue-300"
              >
                <RotateCcw className="h-3 w-3" aria-hidden /> Seçilen başarısız hedefleri yeniden dene ({retry.length})
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-lg border border-[rgb(var(--color-border))] px-2 py-1.5 font-bold text-[rgb(var(--color-muted))]">
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
