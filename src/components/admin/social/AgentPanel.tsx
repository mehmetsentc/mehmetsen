'use client'

/**
 * GÖREV 43 — Vekil Editör paneli.
 * Hesap başına: öğrenilen tercih profili, gölge mod ayarı (aralıklar, «Yoktayım»),
 * son gölge seçimleri ve editörle uyum oranı. Ayrıca «AI ile yaz» konum/kategori
 * düzeltme özeti. Bu ekrandan HİÇBİR paylaşım yapılmaz.
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { auth } from '@/lib/firebase/auth'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { TURKISH_PROVINCES } from '@/constants/cities'

type Run = {
  id: string
  slotKey: string
  status: 'picked' | 'no_candidate' | 'insufficient_data'
  samples: number
  considered: number
  awayAtSlot: boolean
  picks: Array<{ newsId: string; title: string; score: number; reasons: string[] }>
  evaluation: { editorActed: boolean; anyPickMatched: boolean | null; manualNewsIds: string[] } | null
}
type Row = {
  account: { id: string; platform: string; displayName: string; username: string | null; status: string }
  settings: { mode: 'off' | 'shadow' | 'approval' | 'auto'; slots: string[]; awayUntil: number | null; picksPerSlot: number }
  profile: {
    samples: number
    categories: Record<string, number>
    hours: number[]
    featuredShare: number
    perDay: number
    medianDelayMin: number | null
  }
  agreement7d: { comparable: number; matched: number; rate: number | null }
  runs: Run[]
}
type Overview = {
  shadowEnabled: boolean
  accounts: Row[]
  corrections: {
    total: number
    byField: Record<'citySlug' | 'districtSlug' | 'categoryId', number>
    topPairs: Array<{ field: string; from: string; to: string; count: number }>
    topSources: Array<{ sourceHost: string; count: number }>
  } | null
}

const CAT = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c.name]))
const CITY = new Map(TURKISH_PROVINCES.map((p) => [p.slug, p.name]))
const FIELD = { citySlug: 'İl', districtSlug: 'İlçe', categoryId: 'Kategori' } as Record<string, string>
const MIN_SAMPLES = 10

async function api<T>(path: string, init: RequestInit = {}): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  try {
    const res = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, error: (body as { error?: string } | null)?.error ?? `HTTP ${res.status}` }
    return { ok: true, data: body as T }
  } catch {
    return { ok: false, error: 'Ağ hatası' }
  }
}

function label(field: string, v: string): string {
  if (!v) return '(boş)'
  if (field === 'categoryId') return CAT.get(v) ?? v
  if (field === 'citySlug') return CITY.get(v) ?? v
  return v
}

function AccountCard({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const [mode, setMode] = useState(row.settings.mode === 'shadow' ? 'shadow' : 'off')
  const [slots, setSlots] = useState(row.settings.slots.join(', ') || '09:00, 13:00, 18:00, 21:00')
  const [awayHours, setAwayHours] = useState('')
  const [saving, setSaving] = useState(false)
  const p = row.profile
  const cats = Object.entries(p.categories).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const topHours = p.hours
    .map((v, h) => [h, v] as const)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([h]) => `${String(h).padStart(2, '0')}:00`)
  const a = row.agreement7d

  async function save(awayUntil: number | null | undefined) {
    setSaving(true)
    const r = await api('/api/admin/social/agent', {
      method: 'PUT',
      body: JSON.stringify({
        accountId: row.account.id,
        mode,
        slots: slots.split(/[,\s]+/).filter(Boolean),
        awayUntil: awayUntil === undefined ? row.settings.awayUntil : awayUntil,
        picksPerSlot: 3,
      }),
    })
    setSaving(false)
    if (!r.ok) return toast.error(r.error)
    toast.success('Kaydedildi')
    onSaved()
  }

  return (
    <section className="space-y-3 rounded-xl border border-[rgb(var(--color-border))] p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">
            {row.account.username ? `@${row.account.username}` : row.account.displayName}{' '}
            <span className="text-xs font-normal text-[rgb(var(--color-muted))]">{row.account.platform}</span>
          </h3>
          <p className="text-xs text-[rgb(var(--color-muted))]">
            Son 60 günde öğrenilen {p.samples} elle paylaşım
            {p.samples < MIN_SAMPLES ? ` — ajanın seçim yapması için en az ${MIN_SAMPLES} gerekir` : ''}
          </p>
        </div>
        <div className="text-right text-sm">
          <div className="font-semibold">
            {a.rate === null ? 'Uyum: henüz ölçülmedi' : `Uyum (7 gün): %${Math.round(a.rate * 100)}`}
          </div>
          <div className="text-xs text-[rgb(var(--color-muted))]">{a.comparable ? `${a.matched}/${a.comparable} aralık` : ''}</div>
        </div>
      </header>

      {p.samples > 0 ? (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold text-[rgb(var(--color-muted))]">Seçtiğin kategoriler</div>
            {cats.map(([c, v]) => (
              <div key={c}>
                {CAT.get(c) ?? c} — %{Math.round(v * 100)}
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <div className="text-xs font-semibold text-[rgb(var(--color-muted))]">Alışkanlıklar</div>
            <div>Günde ortalama {p.perDay.toFixed(1)} paylaşım</div>
            <div>Öne çıkan haber payı %{Math.round(p.featuredShare * 100)}</div>
            {p.medianDelayMin !== null ? <div>Yayından paylaşıma medyan {p.medianDelayMin} dk</div> : null}
            {topHours.length ? <div>En sık saatler: {topHours.join(', ')}</div> : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 border-t border-[rgb(var(--color-border))] pt-3 text-sm">
        <label className="space-y-1">
          <span className="block text-xs font-semibold">Mod</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as 'off' | 'shadow')} className="rounded-lg border px-2 py-1">
            <option value="off">Kapalı</option>
            <option value="shadow">Gölge mod (paylaşım yok)</option>
            <option value="approval" disabled>Onaylı vekil (yakında)</option>
            <option value="auto" disabled>Tam otomatik (yakında)</option>
          </select>
        </label>
        <label className="min-w-[220px] flex-1 space-y-1">
          <span className="block text-xs font-semibold">Yayın aralıkları (İstanbul saati)</span>
          <input value={slots} onChange={(e) => setSlots(e.target.value)} className="w-full rounded-lg border px-2 py-1" />
        </label>
        <button disabled={saving} onClick={() => save(undefined)} className="rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Kaydet'}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-semibold">Yoktayım:</span>
        {row.settings.awayUntil && row.settings.awayUntil > Date.now() ? (
          <>
            <span>{new Date(row.settings.awayUntil).toLocaleString('tr-TR')} saatine kadar</span>
            <button onClick={() => save(null)} className="rounded border px-2 py-0.5 text-xs">Kapat</button>
          </>
        ) : (
          <>
            <input value={awayHours} onChange={(e) => setAwayHours(e.target.value)} placeholder="saat" className="w-16 rounded border px-2 py-0.5" />
            <button
              onClick={() => {
                const h = Number(awayHours)
                if (!Number.isFinite(h) || h <= 0 || h > 720) return toast.error('1–720 saat girin')
                void save(Date.now() + h * 3_600_000)
              }}
              className="rounded border px-2 py-0.5 text-xs"
            >
              Başlat
            </button>
            <span className="text-xs text-[rgb(var(--color-muted))]">Gölge modda yalnızca kaydedilir; ajan paylaşım yapmaz.</span>
          </>
        )}
      </div>

      {row.runs.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Son gölge seçimleri ({row.runs.length})</summary>
          <ul className="mt-2 space-y-2">
            {row.runs.map((r) => (
              <li key={r.id} className="rounded-lg bg-[rgb(var(--color-surface-2,240_240_240))] p-2">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold">{r.slotKey}{r.awayAtSlot ? ' · yoktaydın' : ''}</span>
                  <span>
                    {r.status === 'insufficient_data'
                      ? 'yetersiz veri'
                      : r.status === 'no_candidate'
                        ? `uygun aday yok (${r.considered} haber incelendi)`
                        : !r.evaluation
                          ? 'karşılaştırma bekleniyor'
                          : !r.evaluation.editorActed
                            ? 'sen paylaşmadın — ajan burada devreye girerdi'
                            : r.evaluation.anyPickMatched
                              ? 'senin seçiminle aynı'
                              : 'farklı seçti'}
                  </span>
                </div>
                {r.picks.map((p) => (
                  <div key={p.newsId} className="mt-1">
                    <span className={r.evaluation?.manualNewsIds.includes(p.newsId) ? 'font-semibold text-green-700' : ''}>{p.title}</span>
                    <span className="text-xs text-[rgb(var(--color-muted))]"> — {p.reasons.join(' · ')}</span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}

export function AgentPanel() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [backfilling, setBackfilling] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    const r = await api<Overview>('/api/admin/social/agent')
    setLoading(false)
    if (!r.ok) return toast.error(r.error)
    setData(r.data)
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function backfill() {
    setBackfilling(true)
    const r = await api<{ audits: number; decisions: number; news: number }>('/api/admin/social/agent/backfill', { method: 'POST' })
    setBackfilling(false)
    if (!r.ok) return toast.error(r.error)
    toast.success(`${r.data.decisions} geçmiş paylaşım öğrenme kaydına eklendi`)
    void load()
  }

  if (loading && !data) return <Loader2 className="h-5 w-5 animate-spin" />
  if (!data) return null
  const c = data.corrections
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <span className="flex-1">
          Vekil editör senin elle yaptığın paylaşımlardan öğrenir. Gölge modda her yayın aralığında «ben olsam bunu paylaşırdım» der,
          hiçbir şey yayımlamaz; iki saat sonra senin seçiminle karşılaştırır.
          {data.shadowEnabled ? '' : ' Sunucuda gölge mod henüz açık değil (SOCIAL_AGENT_SHADOW_ENABLED).'}
        </span>
        <button onClick={backfill} disabled={backfilling} className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 font-semibold">
          {backfilling ? 'Aktarılıyor…' : 'Geçmiş paylaşımlardan öğren'}
        </button>
        <button onClick={() => void load()} className="rounded-lg border border-blue-300 bg-white p-1.5" aria-label="Yenile">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <section className="rounded-xl border border-[rgb(var(--color-border))] p-4 text-sm">
        <h3 className="mb-2 font-semibold">«AI ile yaz» düzeltmeleri (son 30 gün)</h3>
        {!c || c.total === 0 ? (
          <p className="text-[rgb(var(--color-muted))]">
            Henüz kayıt yok. AI&apos;ın yazdığı bir haberde il, ilçe veya kategoriyi değiştirdiğinde burada sayılır.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div>{c.total} haberde düzeltme</div>
              <div>İl {c.byField.citySlug} · İlçe {c.byField.districtSlug} · Kategori {c.byField.categoryId}</div>
              <div className="mt-2 text-xs font-semibold text-[rgb(var(--color-muted))]">En çok düzeltilen kaynaklar</div>
              {c.topSources.slice(0, 5).map((s) => (
                <div key={s.sourceHost}>{s.sourceHost || '(kaynak yok)'} — {s.count}</div>
              ))}
            </div>
            <div>
              <div className="text-xs font-semibold text-[rgb(var(--color-muted))]">En sık düzeltme</div>
              {c.topPairs.slice(0, 8).map((p, i) => (
                <div key={i}>
                  {FIELD[p.field]}: {label(p.field, p.from)} → {label(p.field, p.to)} ({p.count})
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {data.accounts.map((row) => (
        <AccountCard key={row.account.id} row={row} onSaved={() => void load()} />
      ))}
    </div>
  )
}
