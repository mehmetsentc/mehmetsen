'use client'

/**
 * REELS-2 — voice library: listen to every Turkish Google voice, pick the studio
 * default, speaking rate and per-category voices. Samples count against the
 * same free-tier counter (≈90 characters each).
 */
import { useMemo, useState } from 'react'
import { Check, Loader2, Play, Save } from 'lucide-react'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { cn } from '@/lib/utils'
import { GENDER_TEXT, reelsCall, TIER_TEXT, voiceLabel, type VoiceSettings, type VoicesResponse } from './reelsApi'

export function ReelsVoiceLibrary({
  data,
  onSaved,
  onUsageChange,
}: {
  data: VoicesResponse
  onSaved: (s: VoiceSettings) => void
  onUsageChange: () => void
}) {
  const [draft, setDraft] = useState<VoiceSettings>(data.settings)
  const [tier, setTier] = useState<string>('all')
  const [sample, setSample] = useState('')
  const [playing, setPlaying] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [catPick, setCatPick] = useState('')

  const current = draft.defaultVoice ?? data.effective.voice
  const rate = draft.rate ?? data.effective.rate
  const tiers = useMemo(() => [...new Set(data.voices.map((v) => v.tier))], [data.voices])
  const shown = data.voices.filter((v) => tier === 'all' || v.tier === tier)
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings)

  const listen = async (voice: string) => {
    setPlaying(voice)
    setMsg(null)
    const r = await reelsCall<{ audio: string }>('POST', '/api/admin/social/reels/preview', { voice, rate, text: sample || undefined })
    onUsageChange()
    if (!r.ok) {
      setPlaying(null)
      setMsg({ ok: false, text: r.error })
      return
    }
    // CSP media-src allows blob: (not data:) → decode the WAV into a Blob URL.
    const b64 = r.data.audio.slice(r.data.audio.indexOf(',') + 1)
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
    const audio = new Audio(url)
    const done = () => {
      setPlaying(null)
      URL.revokeObjectURL(url)
    }
    audio.onended = done
    audio.onerror = () => {
      done()
      setMsg({ ok: false, text: 'Ses çalınamadı' })
    }
    void audio.play().catch(() => done())
  }

  const save = async () => {
    setSaving(true)
    const r = await reelsCall<{ settings: VoiceSettings }>('POST', '/api/admin/social/reels/voices', draft)
    setSaving(false)
    if (r.ok) {
      setDraft(r.data.settings)
      onSaved(r.data.settings)
      setMsg({ ok: true, text: 'Ses ayarları kaydedildi' })
    } else setMsg({ ok: false, text: r.error })
  }

  const categories = DEFAULT_CATEGORIES.filter((c) => c.id !== 'trend')

  return (
    <section className="space-y-3 rounded-xl border border-[rgb(var(--color-border))] p-4 text-sm" data-reels-voices>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">Ses kütüphanesi</p>
          <p className="text-xs text-[rgb(var(--color-muted))]">
            Varsayılan: <b>{voiceLabel(current)}</b> · hız {rate.toFixed(2)}
            {data.catalogSource === 'static' ? ' · liste çevrimdışı (sabit liste)' : ''}
          </p>
        </div>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Kaydet
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          value={sample}
          onChange={(e) => setSample(e.target.value.slice(0, 200))}
          placeholder="Deneme metni (boşsa: «NaHaber'den son dakika…»)"
          className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-1.5"
        />
        <label className="flex items-center gap-2 text-xs">
          Hız
          <input
            type="range"
            min={0.8}
            max={1.3}
            step={0.05}
            value={rate}
            onChange={(e) => setDraft({ ...draft, rate: Number(e.target.value) })}
          />
          <span className="w-9 tabular-nums">{rate.toFixed(2)}</span>
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs">
        {['all', ...tiers].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTier(t)}
            className={cn('rounded-full border px-2.5 py-0.5', tier === t ? 'border-red-600 bg-red-600 text-white' : 'border-[rgb(var(--color-border))]')}
          >
            {t === 'all' ? 'Tümü' : TIER_TEXT[t] ?? t}
          </button>
        ))}
      </div>

      <ul className="grid max-h-80 gap-1.5 overflow-y-auto sm:grid-cols-2">
        {shown.map((v) => {
          const isDefault = v.name === current
          return (
            <li
              key={v.name}
              className={cn('flex items-center gap-2 rounded-lg border px-2.5 py-1.5', isDefault ? 'border-red-600' : 'border-[rgb(var(--color-border))]')}
            >
              <button
                type="button"
                aria-label={`${v.name} dinle`}
                onClick={() => listen(v.name)}
                disabled={playing !== null}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-border))] disabled:opacity-50"
              >
                {playing === v.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              </button>
              <span className="min-w-0 flex-1 truncate">
                {voiceLabel(v.name)}
                <span className="ml-1 text-xs text-[rgb(var(--color-muted))]">{GENDER_TEXT[v.gender]}</span>
              </span>
              {isDefault ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                  <Check className="h-3.5 w-3.5" /> Varsayılan
                </span>
              ) : (
                <button type="button" onClick={() => setDraft({ ...draft, defaultVoice: v.name })} className="text-xs underline">
                  Varsayılan yap
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <div className="space-y-2 border-t border-[rgb(var(--color-border))] pt-3">
        <p className="text-xs font-semibold">Kategoriye özel ses (isteğe bağlı)</p>
        <div className="flex flex-wrap gap-2">
          <select value={catPick} onChange={(e) => setCatPick(e.target.value)} className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1 text-xs">
            <option value="">Kategori seç…</option>
            {categories.filter((c) => !draft.categoryVoices[c.id]).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!catPick}
            onClick={() => {
              setDraft({ ...draft, categoryVoices: { ...draft.categoryVoices, [catPick]: current } })
              setCatPick('')
            }}
            className="rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 text-xs disabled:opacity-40"
          >
            Ekle
          </button>
        </div>
        {Object.entries(draft.categoryVoices).map(([cat, voice]) => (
          <div key={cat} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="w-28 shrink-0">{categories.find((c) => c.id === cat)?.name ?? cat}</span>
            <select
              value={voice}
              onChange={(e) => setDraft({ ...draft, categoryVoices: { ...draft.categoryVoices, [cat]: e.target.value } })}
              className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1"
            >
              {data.voices.map((v) => (
                <option key={v.name} value={v.name}>{voiceLabel(v.name)} ({GENDER_TEXT[v.gender]})</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const next = { ...draft.categoryVoices }
                delete next[cat]
                setDraft({ ...draft, categoryVoices: next })
              }}
              className="underline"
            >
              Kaldır
            </button>
          </div>
        ))}
      </div>

      {msg ? <p className={cn('text-xs', msg.ok ? 'text-emerald-600' : 'text-red-500')}>{msg.text}</p> : null}
    </section>
  )
}
