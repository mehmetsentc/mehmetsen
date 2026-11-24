'use client'

/**
 * KURGU — Video Merkezi ana sayfası, CapCut düzeninde:
 *   «Proje oluştur» bandı (oran seç → boş proje → editör) · AI araç kartları · Projeler tablosu.
 * Kurgu projeleri yeni editörde, AI (hikâye) projeleri kendi editöründe açılır. Eski ekranlar «Eski araçlar»da.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Clapperboard, FileText, Film, Home, ListVideo, Loader2, Newspaper, Plus, Scissors, Search, Sparkles, Trash2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { reelsCall } from '@/components/admin/social/reelsApi'
import { auth } from '@/lib/firebase/auth'
import { ASPECT_LABEL, CLOSING_MS, renderKeyFor, timeline, type Aspect, type EditProject } from '@/lib/edit/editProject'
import { renderKeyFor as storyKeyFor, type StoryProject } from '@/lib/story/storyProject'
import { KURGU_API } from './KurguEditor'

type Row = { kind: 'edit' | 'story'; id: string; title: string; cover: string | null; size: string; ms: number | null; status: 'ready' | 'draft' | 'error'; updatedAt: number }
type Start = 'news' | 'text' | 'digest'

const fmt = (ms: number | null) => {
  if (ms === null) return '—'
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const when = (t: number) => new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const STATUS = { ready: ['Hazır', 'text-emerald-300 bg-emerald-500/10'], draft: ['Taslak', 'text-zinc-300 bg-zinc-500/15'], error: ['Hata', 'text-red-300 bg-red-500/10'] } as const

export function KurguHome(props: { onOpenEdit: (id: string, opts?: { media?: 'device' | 'library' }) => void; onOpenStory: (id: string) => void; onStart: (s: Start) => void }) {
  const [edits, setEdits] = useState<EditProject[] | null>(null)
  const [stories, setStories] = useState<StoryProject[] | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [nav, setNav] = useState<'home' | 'projects'>('home')
  const [del, setDel] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([reelsCall<{ projects: EditProject[] }>('GET', KURGU_API), reelsCall<{ projects: StoryProject[] }>('GET', '/api/admin/social/story-projects')])
    setEdits(a.ok ? a.data.projects : [])
    setStories(b.ok ? b.data.projects : [])
    if (!a.ok) toast.error(a.error)
  }, [])
  useEffect(() => void load(), [load])

  const create = async (aspect: Aspect, media?: 'device' | 'library') => {
    setCreating(aspect + (media ?? ''))
    const r = await reelsCall<{ project: EditProject }>('POST', KURGU_API, { aspect, title: media === 'device' ? 'Kendi videom' : undefined })
    setCreating(null)
    if (!r.ok) return void toast.error(r.error)
    props.onOpenEdit(r.data.project.id, media ? { media } : undefined)
  }
  const remove = async (id: string) => {
    const token = (await auth.currentUser?.getIdToken()) ?? ''
    const res = await fetch(`${KURGU_API}/${id}`, { method: 'DELETE', credentials: 'same-origin', headers: { Authorization: `Bearer ${token}` } }).catch(() => null)
    setDel(null)
    if (!res?.ok) return void toast.error(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Silinemedi')
    setEdits((l) => (l ?? []).filter((p) => p.id !== id))
  }

  const rows = useMemo<Row[] | null>(() => {
    if (!edits || !stories) return null
    const a: Row[] = edits.map((p) => {
      const tl = timeline(p.clips)
      const cover = p.render.coverUrl ?? p.assets.find((x) => x.posterUrl)?.posterUrl ?? null
      return { kind: 'edit', id: p.id, title: p.title, cover, size: ASPECT_LABEL[p.aspect], ms: p.clips.length ? tl.total + (p.closing ? CLOSING_MS : 0) : null, status: p.render.status === 'ready' && p.render.key === renderKeyFor(p) ? 'ready' : p.render.status === 'failed' ? 'error' : 'draft', updatedAt: p.updatedAt }
    })
    const b: Row[] = stories.map((p) => ({
      kind: 'story',
      id: p.id,
      title: p.title,
      cover: p.render.coverUrl ?? p.assets.find((x) => x.previewUrl)?.previewUrl ?? null,
      size: p.format === 'horizontal' ? '16:9 · AI video' : '9:16 · AI video',
      ms: p.render.seconds ? p.render.seconds * 1000 : null,
      status: p.render.status === 'ready' && p.render.key === storyKeyFor(p) ? 'ready' : p.render.status === 'failed' ? 'error' : 'draft',
      updatedAt: p.updatedAt,
    }))
    const needle = q.trim().toLocaleLowerCase('tr-TR')
    return [...a, ...b].filter((r) => !needle || r.title.toLocaleLowerCase('tr-TR').includes(needle)).sort((x, y) => y.updatedAt - x.updatedAt)
  }, [edits, stories, q])

  const tool = 'group flex min-w-0 flex-col gap-2 rounded-xl border border-[#26282D] bg-[#17181B] p-4 text-left transition hover:border-cyan-400/60 hover:bg-[#1B1D21]'
  return (
    <div className="flex min-h-[calc(100dvh-64px)] bg-[#0E0F11] text-zinc-200">
      {/* left nav */}
      <nav className="hidden w-52 shrink-0 flex-col gap-1 border-r border-[#1F2125] p-3 md:flex" aria-label="Video Merkezi">
        <p className="px-2 pb-3 pt-1 text-[15px] font-extrabold text-white">Video Merkezi</p>
        {(
          [
            ['home', 'Ana sayfa', Home],
            ['projects', 'Projeler', Clapperboard],
          ] as const
        ).map(([id, l, Icon]) => (
          <button key={id} type="button" onClick={() => setNav(id)} className={cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold', nav === id ? 'bg-[#22242A] text-white' : 'text-zinc-400 hover:bg-[#1A1B1F] hover:text-zinc-200')}>
            <Icon className="h-4 w-4" /> {l}
          </button>
        ))}
        <p className="mt-4 px-2.5 text-[11px] font-bold uppercase tracking-wide text-zinc-600">AI ile içerik</p>
        {(
          [
            ['news', 'Haberden video', Newspaper],
            ['text', 'Metinden video', FileText],
            ['digest', 'Günün bülteni', ListVideo],
          ] as const
        ).map(([id, l, Icon]) => (
          <button key={id} type="button" onClick={() => props.onStart(id)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-zinc-400 hover:bg-[#1A1B1F] hover:text-zinc-200">
            <Icon className="h-4 w-4" /> {l}
          </button>
        ))}
        <div className="mt-auto flex flex-col gap-1 border-t border-[#1F2125] pt-3 text-[12px]">
          <p className="px-2.5 text-[11px] font-bold uppercase tracking-wide text-zinc-600">Eski araçlar</p>
          <Link href="/admin/video?start=cut" className="rounded px-2.5 py-1 text-zinc-500 hover:text-zinc-300">
            Eski kes / böl
          </Link>
          <Link href="/admin/video?start=upload" className="rounded px-2.5 py-1 text-zinc-500 hover:text-zinc-300">
            Eski video yükleme şablonları
          </Link>
          <Link href="/admin/video?eski=1" className="rounded px-2.5 py-1 text-zinc-500 hover:text-zinc-300">
            Eski Video Merkezi
          </Link>
          <Link href="/admin/media-studio/reels" className="rounded px-2.5 py-1 text-zinc-500 hover:text-zinc-300">
            Eski Reels Stüdyosu
          </Link>
        </div>
      </nav>

      <main className="mx-auto flex w-full max-w-[1280px] min-w-0 flex-col gap-7 p-5 lg:p-7">
        {nav === 'home' ? (
          <>
            {/* create banner */}
            <section className="relative overflow-hidden rounded-2xl border border-[#26282D] bg-gradient-to-br from-[#123A44] via-[#15191F] to-[#2A1530] p-6">
              <div className="flex flex-wrap items-center justify-between gap-5">
                <div>
                  <h1 className="text-[26px] font-extrabold tracking-tight text-white">Proje oluştur</h1>
                  <p className="mt-1 max-w-xl text-[13px] text-zinc-300">Video, fotoğraf ve haber medyasını zaman çizelgesinde birleştir; kes, böl, kırp, yazı, müzik ve seslendirme ekle. Her video nahaber.com kapanışıyla biter.</p>
                </div>
                <button type="button" disabled={!!creating} onClick={() => create('9:16')} className="flex items-center gap-2 rounded-xl bg-cyan-400 px-6 py-3.5 text-[15px] font-extrabold text-black shadow-lg hover:bg-cyan-300 disabled:opacity-50">
                  {creating === '9:16' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />} Yeni proje
                </button>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {(['9:16', '16:9', '1:1', '4:5'] as const).map((a) => (
                  <button key={a} type="button" disabled={!!creating} onClick={() => create(a)} className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-[12px] font-semibold text-zinc-100 hover:border-cyan-300 disabled:opacity-50">
                    <span className="inline-block border-2 border-zinc-300" style={{ width: a === '16:9' ? 22 : a === '1:1' ? 14 : a === '4:5' ? 13 : 10, height: a === '16:9' ? 12 : a === '1:1' ? 14 : a === '4:5' ? 16 : 18 }} />
                    {ASPECT_LABEL[a]}
                    {creating === a ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  </button>
                ))}
                <button type="button" disabled={!!creating} onClick={() => create('9:16', 'device')} className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-[12px] font-semibold text-zinc-100 hover:border-cyan-300 disabled:opacity-50">
                  <Upload className="h-4 w-4" /> Videoyu yükle ve başla
                </button>
              </div>
            </section>

            {/* tools */}
            <section className="flex flex-col gap-3">
              <h2 className="text-[15px] font-bold text-white">Araçlar</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
                <button type="button" onClick={() => props.onStart('news')} className={tool}>
                  <span className="flex items-center justify-between">
                    <Newspaper className="h-6 w-6 text-red-400" />
                    <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold text-violet-200">AI</span>
                  </span>
                  <span className="text-[14px] font-bold text-white">Haberden video</span>
                  <span className="text-[12px] text-zinc-400">Haberi seç; anlatım, seslendirme ve görseller hazır gelsin.</span>
                </button>
                <button type="button" onClick={() => props.onStart('text')} className={tool}>
                  <span className="flex items-center justify-between">
                    <FileText className="h-6 w-6 text-violet-300" />
                    <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold text-violet-200">AI</span>
                  </span>
                  <span className="text-[14px] font-bold text-white">Metinden video</span>
                  <span className="text-[12px] text-zinc-400">Konu ya da metin yaz; belgesel, bilgi, sağlık… 1–10 dk.</span>
                </button>
                <button type="button" onClick={() => props.onStart('digest')} className={tool}>
                  <span className="flex items-center justify-between">
                    <ListVideo className="h-6 w-6 text-amber-300" />
                    <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold text-violet-200">AI</span>
                  </span>
                  <span className="text-[14px] font-bold text-white">Günün bülteni</span>
                  <span className="text-[12px] text-zinc-400">2–7 haberi seç, tek videoda öne çıkanlar.</span>
                </button>
                <button type="button" disabled={!!creating} onClick={() => create('original', 'library')} className={tool}>
                  <Scissors className="h-6 w-6 text-emerald-300" />
                  <span className="text-[14px] font-bold text-white">Video kes ve böl</span>
                  <span className="text-[12px] text-zinc-400">Uzun videoyu kısalt, böl, parça çıkar, kırp; 9:16 · 1:1 · 16:9.</span>
                </button>
                <button type="button" disabled={!!creating} onClick={() => create('9:16', 'device')} className={tool}>
                  <Upload className="h-6 w-6 text-sky-300" />
                  <span className="text-[14px] font-bold text-white">Kendi videon</span>
                  <span className="text-[12px] text-zinc-400">Cihazdan yükle; yazı, alt bant, müzik ve seslendirme ekle.</span>
                </button>
              </div>
            </section>
          </>
        ) : null}

        {/* projects */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[15px] font-bold text-white">Projeler</h2>
            <label className="flex h-9 w-72 max-w-full items-center gap-2 rounded-lg border border-[#26282D] bg-[#17181B] px-3">
              <Search className="h-4 w-4 text-zinc-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Projelerde ara" aria-label="Projelerde ara" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
            </label>
          </div>
          {rows === null ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-[#17181B]" />
              ))}
            </div>
          ) : !rows.length ? (
            <p className="rounded-xl border border-dashed border-[#26282D] p-8 text-center text-[13px] text-zinc-500">Henüz proje yok. «Yeni proje» ile başlayın.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#26282D]">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[#17181B] text-[11px] uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">İsim</th>
                    <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">Boyut</th>
                    <th className="px-3 py-2.5 font-semibold">Süre</th>
                    <th className="hidden px-3 py-2.5 font-semibold md:table-cell">Durum</th>
                    <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">Son düzenleme</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.kind}-${r.id}`} className="cursor-pointer border-t border-[#1F2125] hover:bg-[#15161A]" onClick={() => (r.kind === 'edit' ? props.onOpenEdit(r.id) : props.onOpenStory(r.id))}>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-3">
                          <span className="relative flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-[#22242A]">
                            {r.cover ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.cover} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Film className="h-4 w-4 text-zinc-600" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="line-clamp-1 font-semibold text-zinc-100">{r.title}</span>
                            <span className="flex items-center gap-1 text-[11px] text-zinc-500">{r.kind === 'story' ? (<><Sparkles className="h-3 w-3" /> AI video</>) : 'Kurgu'}</span>
                          </span>
                        </span>
                      </td>
                      <td className="hidden px-3 py-2 text-zinc-400 sm:table-cell">{r.size}</td>
                      <td className="px-3 py-2 tabular-nums text-zinc-400">{fmt(r.ms)}</td>
                      <td className="hidden px-3 py-2 md:table-cell">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', STATUS[r.status][1])}>{STATUS[r.status][0]}</span>
                      </td>
                      <td className="hidden px-3 py-2 text-zinc-500 sm:table-cell">{when(r.updatedAt)}</td>
                      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        {r.kind === 'edit' ? (
                          del === r.id ? (
                            <span className="inline-flex gap-1.5 text-[11px]">
                              <button type="button" onClick={() => remove(r.id)} className="rounded bg-red-600 px-2 py-1 font-bold text-white">
                                Sil
                              </button>
                              <button type="button" onClick={() => setDel(null)} className="rounded border border-[#33363D] px-2 py-1">
                                Vazgeç
                              </button>
                            </span>
                          ) : (
                            <button type="button" aria-label="Projeyi sil" onClick={() => setDel(r.id)} className="rounded p-1.5 text-zinc-500 hover:bg-[#22242A] hover:text-red-400">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
