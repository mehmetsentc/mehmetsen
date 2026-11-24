'use client'

/**
 * BRAND-CITY-1 — İl ses ve renk: her ilin sunucusu (ad, ses, hız), vurgu rengi ve
 * müziği; kategori grupları için müzik ve «her ilde aynı sunucu» kuralı.
 * Reels haberin iline göre üretilir; paylaşım kartı da ilin rengini kullanır.
 */
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Play, Save, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { reelsCall, voiceLabel } from './reelsApi'

type Music = string
type CityProfile = { presenterName: string | null; voice: string | null; rate: number | null; music: Music | null; accent: string | null }
type GroupRule = { music: Music | null; sameEverywhere: boolean }
type Branding = { enabled: boolean; groups: Record<string, GroupRule>; cities: Record<string, CityProfile> }
type View = {
  branding: Branding
  provinces: Array<{ slug: string; name: string }>
  groups: Array<{ id: string; label: string; presenter: { name: string; title: string; voice: string } }>
  voices: string[]
  pool: string[]
  music: Music[]
  palette: string[]
}

const MUSIC_TEXT: Record<string, string> = {
  sakin: 'Sakin', modern: 'Modern', akustik: 'Akustik', kurumsal: 'Kurumsal', enerjik: 'Enerjik',
  sondakika: 'Son dakika', lofi: 'Lo-fi', none: 'Müziksiz',
}
const EMPTY: CityProfile = { presenterName: null, voice: null, rate: null, music: null, accent: null }
const input = 'rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1 text-sm'

export function CityBrandingPanel() {
  const [view, setView] = useState<View | null>(null)
  const [draft, setDraft] = useState<Branding | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<'load' | 'save' | 'suggest' | null>('load')
  const [playing, setPlaying] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = async () => {
    setBusy('load')
    const r = await reelsCall<View>('GET', '/api/admin/social/reels/branding')
    setBusy(null)
    if (!r.ok) return setMsg({ ok: false, text: r.error })
    setView(r.data)
    setDraft(r.data.branding)
  }
  useEffect(() => {
    void load()
  }, [])

  const dirty = !!view && !!draft && JSON.stringify(view.branding) !== JSON.stringify(draft)
  const filled = draft ? Object.keys(draft.cities).length : 0
  const shown = useMemo(() => {
    const s = q.trim().toLocaleLowerCase('tr-TR')
    return (view?.provinces ?? []).filter((p) => !s || p.name.toLocaleLowerCase('tr-TR').includes(s))
  }, [q, view])

  if (!view || !draft) {
    return (
      <div className="p-4 text-sm text-[rgb(var(--color-muted))]">
        {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null} {msg?.text ?? 'Yükleniyor…'}
      </div>
    )
  }

  const setCity = (slug: string, patch: Partial<CityProfile>) =>
    setDraft((d) => (d ? { ...d, cities: { ...d.cities, [slug]: { ...EMPTY, ...d.cities[slug], ...patch } } } : d))
  const clearCity = (slug: string) =>
    setDraft((d) => {
      if (!d) return d
      const cities = { ...d.cities }
      delete cities[slug]
      return { ...d, cities }
    })
  const setGroup = (id: string, patch: Partial<GroupRule>) =>
    setDraft((d) => (d ? { ...d, groups: { ...d.groups, [id]: { ...d.groups[id]!, ...patch } } } : d))

  const save = async () => {
    setBusy('save')
    setMsg(null)
    const r = await reelsCall<View>('POST', '/api/admin/social/reels/branding', draft)
    setBusy(null)
    if (!r.ok) return setMsg({ ok: false, text: r.error })
    setView(r.data)
    setDraft(r.data.branding)
    setMsg({ ok: true, text: 'Kaydedildi. Yeni üretilen Reels ve paylaşım kartları bu ayarlarla çıkar; daha önce üretilmiş videolar değişmez.' })
  }

  const suggest = async () => {
    setBusy('suggest')
    setMsg(null)
    const r = await reelsCall<{ suggestion: Branding }>('POST', '/api/admin/social/reels/branding', { action: 'suggest' })
    setBusy(null)
    if (!r.ok) return setMsg({ ok: false, text: r.error })
    setDraft((d) => (d ? { ...d, cities: r.data.suggestion.cities } : d))
    setMsg({ ok: true, text: 'Boş iller dolduruldu (komşu illere farklı ses ve renk). Kontrol edip «Kaydet»e basın.' })
  }

  const listen = async (slug: string, name: string, p: CityProfile) => {
    if (!p.voice) return
    setPlaying(slug)
    setMsg(null)
    const text = `NaHaber ${name}. Ben ${p.presenterName || 'sunucunuz'}, ${name}'dan günün gelişmelerini aktarıyorum.`
    const r = await reelsCall<{ audio: string }>('POST', '/api/admin/social/reels/preview', { voice: p.voice, rate: p.rate ?? undefined, text })
    if (!r.ok) {
      setPlaying(null)
      return setMsg({ ok: false, text: r.error })
    }
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
    audio.onerror = done
    void audio.play().catch(done)
  }

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} className="h-4 w-4" />
          İl ses ve renk profilleri açık
        </label>
        <span className="text-xs text-[rgb(var(--color-muted))]">{filled} / {view.provinces.length} il tanımlı</span>
        <div className="ml-auto flex gap-2">
          <button type="button" disabled={!!busy} onClick={() => void suggest()} className="inline-flex items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm font-bold disabled:opacity-50">
            {busy === 'suggest' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Boş illeri otomatik doldur
          </button>
          <button type="button" disabled={!dirty || !!busy} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-1.5 text-sm font-extrabold text-white disabled:opacity-50">
            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Kaydet
          </button>
        </div>
        {msg ? <p className={cn('w-full text-sm', msg.ok ? 'text-green-700' : 'text-red-600')}>{msg.text}</p> : null}
        <p className="w-full text-xs text-[rgb(var(--color-muted))]">
          Video haberin iline göre bir kez üretilir ve o haberi paylaşan bütün hesaplar aynı videoyu kullanır. Son dakika haberlerinde kırmızı renk ve son dakika müziği değişmez. «Dinle» örnekleri seslendirme kotasından düşer.
        </p>
      </section>

      <section className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
        <h2 className="mb-1 text-sm font-extrabold">Kategori kuralları</h2>
        <p className="mb-3 text-xs text-[rgb(var(--color-muted))]">
          «Her ilde aynı sunucu» açıksa o kategorinin haberleri bütün illerde kategorinin sunucusuyla okunur. Kategori müziği seçiliyse ilin müziğinden önce gelir.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {view.groups.map((g) => {
            const rule = draft.groups[g.id] ?? { music: null, sameEverywhere: false }
            return (
              <div key={g.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] p-3 text-sm">
                <div className="min-w-[9rem] flex-1">
                  <p className="font-bold">{g.label}</p>
                  <p className="text-xs text-[rgb(var(--color-muted))]">Sunucu: {g.presenter.name} · {voiceLabel(g.presenter.voice)}</p>
                </div>
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={rule.sameEverywhere} onChange={(e) => setGroup(g.id, { sameEverywhere: e.target.checked })} />
                  Her ilde aynı sunucu
                </label>
                <select value={rule.music ?? ''} onChange={(e) => setGroup(g.id, { music: e.target.value || null })} className={input} aria-label={`${g.label} müziği`}>
                  <option value="">Müzik: il / otomatik</option>
                  {view.music.map((m) => (
                    <option key={m} value={m}>{MUSIC_TEXT[m] ?? m}</option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-extrabold">İller</h2>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="İl ara" className={cn(input, 'ml-auto w-48')} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-left text-xs text-[rgb(var(--color-muted))]">
                <th className="py-1 pr-2">İl</th>
                <th className="py-1 pr-2">Renk</th>
                <th className="py-1 pr-2">Sunucu adı</th>
                <th className="py-1 pr-2">Ses</th>
                <th className="py-1 pr-2">Hız</th>
                <th className="py-1 pr-2">Müzik</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const c = draft.cities[p.slug] ?? EMPTY
                const set = !!draft.cities[p.slug]
                return (
                  <tr key={p.slug} className="border-t border-[rgb(var(--color-border))]">
                    <td className="py-1.5 pr-2 font-semibold">{p.name}</td>
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-1">
                        <input type="color" value={c.accent ?? '#071530'} onChange={(e) => setCity(p.slug, { accent: e.target.value })} className="h-7 w-9 cursor-pointer rounded border border-[rgb(var(--color-border))]" aria-label={`${p.name} rengi`} />
                        {c.accent ? (
                          <button type="button" onClick={() => setCity(p.slug, { accent: null })} className="text-[rgb(var(--color-muted))]" title="Rengi kaldır">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <span className="text-xs text-[rgb(var(--color-muted))]">kategori rengi</span>
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 pr-2">
                      <input value={c.presenterName ?? ''} maxLength={24} onChange={(e) => setCity(p.slug, { presenterName: e.target.value || null })} placeholder="kategori sunucusu" className={cn(input, 'w-32')} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select value={c.voice ?? ''} onChange={(e) => setCity(p.slug, { voice: e.target.value || null })} className={cn(input, 'w-48')} aria-label={`${p.name} sesi`}>
                        <option value="">Kategori sesi</option>
                        {view.voices.map((v) => (
                          <option key={v} value={v}>{voiceLabel(v)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <input type="number" step={0.01} min={0.85} max={1.3} value={c.rate ?? ''} onChange={(e) => setCity(p.slug, { rate: e.target.value ? Number(e.target.value) : null })} placeholder="1.05" className={cn(input, 'w-20')} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select value={c.music ?? ''} onChange={(e) => setCity(p.slug, { music: e.target.value || null })} className={input} aria-label={`${p.name} müziği`}>
                        <option value="">Otomatik</option>
                        {view.music.map((m) => (
                          <option key={m} value={m}>{MUSIC_TEXT[m] ?? m}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <button type="button" disabled={!c.voice || !!playing} onClick={() => void listen(p.slug, p.name, c)} className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 text-xs font-bold disabled:opacity-40">
                        {playing === p.slug ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Dinle
                      </button>
                      {set ? (
                        <button type="button" onClick={() => clearCity(p.slug)} className="ml-1 text-xs underline text-[rgb(var(--color-muted))]">Temizle</button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
