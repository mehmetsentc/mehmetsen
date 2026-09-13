'use client'

import { useState } from 'react'
import { auth } from '@/lib/firebase/auth'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' }
}

export default function R2SelfTestPage() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<number | null>(null)

  const playbackUrl =
    typeof result?.playbackPublicUrl === 'string' ? result.playbackPublicUrl : null
  const posterUrl =
    typeof result?.posterPublicUrl === 'string' ? result.posterPublicUrl : null
  const validationId =
    typeof result?.validationId === 'string' ? result.validationId : null
  const go = result?.go === true
  const createdCount = typeof result?.createdCount === 'number' ? result.createdCount : null
  const deletedCount = typeof result?.deletedCount === 'number' ? result.deletedCount : null
  const remainingCount =
    typeof result?.remainingCount === 'number' ? result.remainingCount : null

  async function call(action: 'run' | 'cleanup' | 'cors-inspect' | 'cors-apply') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/video-library/r2-self-test', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          action,
          validationId: action === 'cleanup' ? validationId : undefined,
        }),
      })
      setStatus(res.status)
      const body = (await res.json()) as Record<string, unknown>
      setResult(body)
      if (!res.ok && typeof body.error === 'string') setError(body.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İstek başarısız')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminOsPageShell
      title="R2 self-test"
      subtitle="Varsayılan kapalı geçici tanı. Video Library açmaz. Cron / otomatik çağrı yok — yalnızca bu sayfadaki butonlar. CORS apply mevcut kuralları silmeden www.nahaber.com ekler."
    >
      <p className="mb-3 max-w-xl text-sm text-zinc-600">
        R2 mutasyonu için sunucuda <code>R2_SELF_TEST_ENABLED=1</code> ve açık{' '}
        <code>action</code> gerekir. GO yalnızca cleanup sonrası created == deleted ve remaining == 0
        ise.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void call('cors-inspect')}
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
        >
          Inspect CORS
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void call('cors-apply')}
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
        >
          Apply CORS
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void call('run')}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Run
        </button>
        <button
          type="button"
          disabled={busy || !validationId}
          onClick={() => void call('cleanup')}
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
        >
          Cleanup
        </button>
      </div>
      {status ? <p className="mt-3 text-sm text-zinc-500">HTTP {status}</p> : null}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {createdCount !== null && deletedCount !== null ? (
        <p className="mt-2 text-sm text-zinc-700">
          Cleanup gate: created {createdCount} / deleted {deletedCount} / remaining{' '}
          {remainingCount ?? 'n/a'} — {go ? 'GO' : 'NO-GO'}
        </p>
      ) : null}
      {playbackUrl ? (
        <div className="mt-4 max-w-xl">
          <video
            src={playbackUrl}
            poster={posterUrl ?? undefined}
            controls
            playsInline
            className="w-full rounded-md bg-black"
          />
        </div>
      ) : null}
      {result ? (
        <pre className="mt-4 overflow-auto rounded-md bg-zinc-950 p-3 text-xs text-zinc-100">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </AdminOsPageShell>
  )
}
