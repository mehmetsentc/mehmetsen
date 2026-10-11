'use client'

/** «Paylaşım geçmişim» — publish ledger + automation jobs of the accounts the user may publish to. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AutomationJobPublic, AutomationJobStatus } from '@/lib/social/automation/jobs'
import { PLATFORM_LABEL, socialApi, type SocialAccountRow } from './socialClient'

type LedgerRow = { newsId: string; accountId: string; platform: string; format: string; status: string; externalPostId: string | null; trigger: string | null; updatedAt: number }

const LEDGER_TEXT: Record<string, { text: string; tone: string }> = {
  succeeded: { text: 'Yayımlandı', tone: 'text-emerald-700 dark:text-emerald-300' },
  publishing: { text: 'Gönderiliyor', tone: 'text-blue-700 dark:text-blue-300' },
  failed: { text: 'Başarısız', tone: 'text-red-700 dark:text-red-300' },
  uncertain: { text: 'Sonuç belirsiz (doğrulanıyor)', tone: 'text-amber-700 dark:text-amber-300' },
}
const JOB_TEXT: Record<AutomationJobStatus, string> = {
  queued: 'Sırada',
  processing: 'İşleniyor',
  published: 'Yayımlandı',
  failed: 'Başarısız',
  cancelled: 'İptal edildi',
  uncertain: 'Sonuç belirsiz',
  skipped: 'Atlandı',
}
const TRIGGER_TEXT: Record<string, string> = { share: 'Manuel (hesabımda yayımla)', composer: 'Manuel (panel)', automation: 'Otomatik kural', cron: 'Eski otomasyon', uncertain_republish: 'Belirsiz sonuç sonrası', force_reshare_bulk: 'Toplu yeniden paylaşım', api_social: 'API' }
const fmt = (ms: number | null) => (ms ? new Date(ms).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

export function ShareHistory({ accountFilter }: { accountFilter?: (a: SocialAccountRow) => boolean }) {
  const [records, setRecords] = useState<LedgerRow[]>([])
  const [jobs, setJobs] = useState<AutomationJobPublic[]>([])
  const [accounts, setAccounts] = useState<SocialAccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [h, a] = await Promise.all([
      socialApi<{ records: LedgerRow[]; jobs: AutomationJobPublic[] }>('/api/social/history'),
      socialApi<{ accounts: SocialAccountRow[] }>('/api/social/accounts'),
    ])
    if (!h.ok) setError(h.error)
    else {
      setRecords(h.data.records)
      setJobs(h.data.jobs)
    }
    if (a.ok) setAccounts(a.data.accounts)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const allowed = useCallback((id: string) => {
    const a = byId.get(id)
    return !accountFilter || (a ? accountFilter(a) : false)
  }, [accountFilter, byId])
  const name = (id: string) => byId.get(id)?.displayName ?? id
  const pendingJobs = jobs.filter((j) => allowed(j.accountId) && (j.status === 'queued' || j.status === 'processing' || j.status === 'failed' || j.status === 'skipped' || j.status === 'cancelled'))
  const shownRecords = records.filter((r) => allowed(r.accountId))

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-[rgb(var(--color-muted))]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Yükleniyor…
      </p>
    )
  }
  if (error) return <p className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 text-xs">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Yenile
        </button>
      </div>
      <section>
        <h3 className="mb-2 text-sm font-bold">Yayın kayıtları</h3>
        {shownRecords.length === 0 ? (
          <p className="text-sm text-[rgb(var(--color-muted))]">Henüz bu hesaplardan yayın kaydı yok.</p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--color-border))] text-sm">
            {shownRecords.map((r) => {
              const s = LEDGER_TEXT[r.status] ?? { text: r.status, tone: '' }
              return (
                <li key={`${r.accountId}:${r.newsId}:${r.format}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2">
                  <span className={cn('font-semibold', s.tone)}>{s.text}</span>
                  <span>{name(r.accountId)}</span>
                  <span className="text-xs text-[rgb(var(--color-muted))]">
                    {PLATFORM_LABEL[r.platform] ?? r.platform} · {r.format === 'story' ? 'Hikâye' : 'Gönderi'} · {TRIGGER_TEXT[r.trigger ?? ''] ?? r.trigger ?? '—'} · haber {r.newsId}
                  </span>
                  <span className="ml-auto text-xs text-[rgb(var(--color-muted))]">{fmt(r.updatedAt)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-sm font-bold">Otomasyon işleri (son 7 gün, yayımlanmamış olanlar)</h3>
        {pendingJobs.length === 0 ? (
          <p className="text-sm text-[rgb(var(--color-muted))]">Bekleyen veya sonuçlanmamış otomatik iş yok.</p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--color-border))] text-sm">
            {pendingJobs.map((j) => (
              <li key={j.id} className="space-y-0.5 py-2">
                <p className="flex flex-wrap gap-x-3">
                  <span className="font-semibold">{JOB_TEXT[j.status]}</span>
                  <span>{name(j.accountId)}</span>
                  <span className="text-xs text-[rgb(var(--color-muted))]">{PLATFORM_LABEL[j.platform]} · {fmt(j.dueAt ?? j.updatedAt)}</span>
                </p>
                <p className="truncate text-xs text-[rgb(var(--color-muted))]">{j.newsTitle}</p>
                {j.errorMessage && <p className="text-xs text-amber-700 dark:text-amber-300">{j.errorMessage}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
