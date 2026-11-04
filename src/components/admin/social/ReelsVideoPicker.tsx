'use client'

/**
 * REELS-T1 «Video yükle» — pick a rights-cleared Video Kütüphanesi file (or upload a new one)
 * as the media of the reel. Uploading reuses the library's own owned-upload flow
 * (upload-init → PUT → upload-complete), so the file lands in the same library.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Film, Loader2, Upload } from 'lucide-react'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'

export type PickedVideo = { id: string; title: string; poster: string | null; durationMs: number | null }

type Item = {
  id: string
  title: string
  status: string
  rightsStatus: string
  durationMs: number | null
  posterPublicUrl?: string | null
  thumbnailUrl?: string | null
}

const USABLE_STATUS = new Set(['READY', 'PROCESSING', 'PLAYBACK_READY'])
const USABLE_RIGHTS = new Set(['OWNED', 'LICENSED', 'PARTNER', 'PERMISSION_GRANTED'])

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function mimeOf(file: File): string {
  if (file.type) return file.type.toLowerCase()
  const n = file.name.toLowerCase()
  return n.endsWith('.webm') ? 'video/webm' : n.endsWith('.mov') ? 'video/quicktime' : n.endsWith('.m4v') ? 'video/x-m4v' : 'video/mp4'
}

const dur = (ms: number | null) => (ms && ms > 0 ? `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}` : '—')

export function ReelsVideoPicker({ value, onChange }: { value: PickedVideo | null; onChange: (v: PickedVideo | null) => void }) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/admin/videos/library?pageSize=50', { headers: await authHeaders() })
      const body = (await res.json()) as { items?: Item[]; error?: string }
      if (!res.ok) throw new Error(body.error || 'Video kütüphanesi açılamadı')
      setItems((body.items ?? []).filter((i) => USABLE_STATUS.has(i.status) && USABLE_RIGHTS.has(i.rightsStatus)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Video kütüphanesi açılamadı')
      setItems([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const upload = async (file: File) => {
    setError(null)
    setUploading(file.name)
    try {
      const mimeType = mimeOf(file)
      const init = await fetch('/api/admin/videos/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'upload-init', filename: file.name, mimeType, fileSizeBytes: file.size, contentHash: await sha256Hex(file) }),
      })
      const ib = (await init.json()) as { outcome?: string; itemId?: string; uploadUrl?: string | null; error?: string; item?: Item }
      if (!init.ok) throw new Error(ib.error || 'Yükleme başlatılamadı')
      if (ib.outcome !== 'ALREADY_IMPORTED') {
        if (!ib.uploadUrl || !ib.itemId) throw new Error('Yükleme adresi alınamadı')
        const put = await fetch(ib.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: file })
        if (!put.ok) throw new Error('Dosya yüklenemedi (ağ / CORS)')
        const done = await fetch('/api/admin/videos/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ action: 'upload-complete', id: ib.itemId }),
        })
        const db = (await done.json()) as { error?: string; item?: Item }
        if (!done.ok) throw new Error(db.error || 'Yükleme tamamlanamadı')
        if (db.item) onChange({ id: db.item.id, title: db.item.title || file.name, poster: db.item.posterPublicUrl ?? null, durationMs: db.item.durationMs ?? null })
        else onChange({ id: ib.itemId, title: file.name, poster: null, durationMs: null })
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yükleme başarısız')
    } finally {
      setUploading(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void upload(f)
        }}
      />
      <button
        type="button"
        disabled={!!uploading}
        onClick={() => fileRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[rgb(var(--color-border))] px-3 py-3 text-xs font-bold text-[rgb(var(--color-text))] hover:border-red-400 hover:bg-red-50/40 disabled:opacity-60 dark:hover:bg-red-950/20"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {uploading ? `Yükleniyor: ${uploading}` : 'Bilgisayardan video yükle (MP4 / MOV / WebM)'}
      </button>
      <p className="text-[10px] text-[rgb(var(--color-muted))]">
        Yüklediğiniz dosya NaHaber’in kendi içeriği olarak (OWNED) Video Kütüphanesi’ne kaydedilir. Başkasına ait videoyu yüklemeyin.
      </p>
      {error ? <p className="rounded-lg bg-red-500/10 px-2 py-1.5 text-[11px] text-red-700 dark:text-red-300">{error}</p> : null}
      <p className="pt-1 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">ya da kütüphaneden seçin</p>
      {items === null ? (
        <div className="space-y-1.5">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-[rgb(var(--color-surface))]" />)}</div>
      ) : items.length === 0 ? (
        <p className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-2 text-[11px] text-[rgb(var(--color-muted))]">Kullanılabilir (hakkı onaylı ve hazır) video yok.</p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto pr-1" role="listbox" aria-label="Kütüphane videoları">
          {items.map((i) => {
            const on = value?.id === i.id
            const poster = i.posterPublicUrl ?? i.thumbnailUrl ?? null
            return (
              <li key={i.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => onChange(on ? null : { id: i.id, title: i.title, poster, durationMs: i.durationMs })}
                  className={cn('flex w-full items-center gap-2 rounded-lg border p-1.5 text-left', on ? 'border-red-600 ring-2 ring-red-200' : 'border-[rgb(var(--color-border))] hover:bg-[rgb(var(--color-surface))]')}
                >
                  {poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={poster} alt="" className="h-10 w-7 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="flex h-10 w-7 shrink-0 items-center justify-center rounded bg-slate-800 text-white"><Film className="h-3.5 w-3.5" /></span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-[11px] font-bold">{i.title || 'Adsız video'}</span>
                    <span className="block text-[10px] text-[rgb(var(--color-muted))]">{dur(i.durationMs)} · {i.rightsStatus === 'OWNED' ? 'NaHaber' : 'lisanslı'}</span>
                  </span>
                  {on ? <Check className="h-4 w-4 shrink-0 text-red-600" /> : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
