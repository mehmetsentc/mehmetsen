'use client'

/**
 * "Sonucu belirsiz paylaşımlar" — records where the platform may have
 * accepted a post but NaHaber never got the answer (lost response, crashed
 * worker). Shows real server data only; loads on open / manual refresh.
 *
 * The only action is an explicit, per-record "Platformda kontrol ettim,
 * yeniden yayımla" with a two-step confirmation. There is NO "mark as
 * published": a success record needs a platform-returned post id.
 */
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'

type UncertainRow = {
  id: string
  newsId: string
  accountId: string
  accountLabel: string
  isLegacyAccount: boolean
  platform: 'facebook' | 'instagram' | 'threads'
  format: 'post' | 'story'
  state: 'uncertain' | 'lease_expired'
  attemptId: string | null
  errorCode: string | null
  attempts: number
  updatedAt: number
  newsTitle: string | null
}

const PLATFORM_LABEL = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads' } as const
const FORMAT_LABEL = { post: 'Gönderi', story: 'Hikâye' } as const
const REASON_TEXT: Record<string, string> = {
  transport_error: 'Platform yanıtı alınamadı (ağ / zaman aşımı)',
  platform_server_error: 'Platform sunucu hatası döndü (gönderi yine de yayımlanmış olabilir)',
  exception: 'Yayın sırasında beklenmeyen hata',
  no_platform_id: 'Platform başarı döndü ama gönderi kimliği vermedi',
  lease_expired: 'Yayın işlemi yarıda kaldı (çalışan sonlandı)',
}

async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return fetch(input, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  })
}

export function UncertainPublishPanel() {
  const [rows, setRows] = useState<UncertainRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authedFetch('/api/admin/social/publish-records')
      if (res.status === 401 || res.status === 403) {
        setError('Bu listeyi görme yetkiniz yok (merkez yönetici gerekli).')
        setRows(null)
        return
      }
      if (!res.ok) throw new Error('load')
      const body = (await res.json()) as { records: UncertainRow[] }
      setRows(body.records)
    } catch {
      setError('Liste yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const republish = async (row: UncertainRow) => {
    if (!checked) return
    setBusy(row.id)
    try {
      const res = await authedFetch(`/api/admin/social/publish-records/${encodeURIComponent(row.id)}/republish`, {
        method: 'POST',
        body: JSON.stringify({ confirm: 'checked_on_platform', attemptId: row.attemptId }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        skipped?: string | null
        result?: { success: boolean; ledgerStatus: string | null; error: string | null } | null
      }
      if (!res.ok) toast.error(body.error ?? 'Yeniden yayımlanamadı')
      else if (body.skipped) toast.error(`Paylaşım yapılmadı: ${body.skipped}`)
      else if (body.result?.success) toast.success('Yeniden yayımlandı (platform gönderi kimliği döndü)')
      else if (body.result?.ledgerStatus === 'uncertain') toast.error('Sonuç yine belirsiz — platformda kontrol edin')
      else toast.error(body.result?.error ?? 'Platform paylaşımı reddetti')
    } finally {
      setBusy(null)
      setConfirming(null)
      setChecked(false)
      void load()
    }
  }

  return (
    <section id="smm-uncertain" className="rounded-xl border border-[rgb(var(--color-border))] p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
          Sonucu belirsiz paylaşımlar
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--color-border))] px-2 py-1 text-xs"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden />
          Yenile
        </button>
      </div>
      <p className="mb-3 text-xs text-[rgb(var(--color-muted))]">
        Bu kayıtlarda platform gönderiyi almış olabilir; NaHaber yanıtı alamadı. Otomatik tekrar yapılmaz. Önce ilgili
        hesabı platformda açıp gönderinin olup olmadığını kontrol edin. Gönderi platformda görünüyorsa yeniden
        yayımlamayın.
      </p>

      {loading && rows === null && (
        <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Yükleniyor…</p>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {rows && rows.length === 0 && <p className="text-sm text-[rgb(var(--color-muted))]">Belirsiz kayıt yok.</p>}

      {rows && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/30">
              <div className="font-semibold">{r.newsTitle ?? `Haber ${r.newsId}`}</div>
              <div className="mt-1 text-xs">
                {PLATFORM_LABEL[r.platform]} · {FORMAT_LABEL[r.format]} · Hesap: <strong>{r.accountLabel}</strong>
                {r.isLegacyAccount && ' (Onyeditivi)'}
              </div>
              <div className="mt-1 text-xs text-[rgb(var(--color-muted))]">
                {REASON_TEXT[r.state === 'lease_expired' ? 'lease_expired' : (r.errorCode ?? '')] ?? 'Sonuç doğrulanamadı'} ·{' '}
                {r.attempts} deneme · {r.updatedAt ? new Date(r.updatedAt).toLocaleString('tr-TR') : '—'}
              </div>

              {confirming !== r.id ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(r.id)
                    setChecked(false)
                  }}
                  className="mt-2 rounded-md border border-amber-600 px-2 py-1 text-xs font-semibold text-amber-800 dark:text-amber-200"
                >
                  Platformda kontrol ettim, yeniden yayımla…
                </button>
              ) : (
                <div className="mt-2 rounded-md border border-red-300 bg-white p-2 text-xs dark:bg-transparent">
                  <p className="font-semibold text-red-700">
                    Uyarı: Gönderi platformda zaten varsa yeniden yayımlamak YİNELENEN gönderi oluşturur. Bu onay yalnızca
                    bu kayıt ({PLATFORM_LABEL[r.platform]} · {FORMAT_LABEL[r.format]} · {r.accountLabel}) için geçerlidir.
                  </p>
                  <label className="mt-2 flex items-start gap-2">
                    <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
                    <span>{r.accountLabel} hesabını platformda kontrol ettim; bu haberin {FORMAT_LABEL[r.format].toLowerCase()} paylaşımı orada YOK.</span>
                  </label>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={!checked || busy === r.id}
                      onClick={() => void republish(r)}
                      className="rounded-md bg-red-600 px-2 py-1 font-semibold text-white disabled:opacity-50"
                    >
                      {busy === r.id ? 'Yayımlanıyor…' : 'Yeniden yayımla'}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="rounded-md border px-2 py-1">
                      Vazgeç
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
