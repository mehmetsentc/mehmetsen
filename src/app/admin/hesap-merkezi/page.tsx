'use client'

/**
 * Hesap Merkezi — NaHaber'in kendi hesaplarının (istanbul.nahaber, bursa.nahaber …)
 * yorum, mesaj ve bildirimlerini tek ekranda yönetme. Yalnızca süper admin.
 * Tüm okuma/yazma /api/admin/account-center üzerinden, hesap UID'si sunucuda birebir kontrol edilir.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Bot, EyeOff, Eye, Inbox, Loader2, MessageSquare, Newspaper, Plus,
  RefreshCw, Search, Send, Settings2, Shield, Trash2, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import {
  AUTO_REPLY_FOOTER,
  CATEGORY_TR,
  isAutoSafe,
  REPLY_MAX_LENGTH,
  type AccountCenterSettings,
  type InboxCategory,
  type InboxItem,
  type InboxTab,
} from '@/lib/accountCenter/model'

// ── API ──────────────────────────────────────────────────────────────────────

const API = '/api/admin/account-center'

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  const res = await fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    cache: 'no-store',
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(errorText(data.error))
  return data
}
const post = <T,>(body: Record<string, unknown>) => api<T>(API, { method: 'POST', body: JSON.stringify(body) })

function errorText(code: string | undefined): string {
  switch (code) {
    case 'Unauthorized': return 'Bu ekran yalnızca süper admin içindir.'
    case 'not_managed': return 'Bu hesap Hesap Merkezi listesinde değil.'
    case 'not_owner': return 'Bu içerik seçili hesaba ait değil.'
    case 'not_found': return 'Bulunamadı.'
    case 'ambiguous': return 'Bu kullanıcı adıyla birden fazla hesap var; UID ile ekleyin.'
    case 'staff_account': return 'Ekip (CMS) hesapları eklenemez.'
    case 'empty': return 'Cevap boş olamaz.'
    case 'foreign_link': return 'nahaber.com dışındaki linkler gönderilemez.'
    case 'content_not_found': return 'İlgili haber/paylaşım bulunamadı.'
    case 'duplicate': return 'Bu cevap zaten gönderildi.'
    default: return 'İşlem tamamlanamadı, tekrar deneyin.'
  }
}

const newRequestId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 40)

// ── Types ────────────────────────────────────────────────────────────────────

interface AccountView {
  uid: string
  username: string
  displayName: string | null
  photoURL: string | null
  counts: { pendingComments: number; unreadMessages: number; activity: number }
}
interface Detail {
  item: InboxItem
  content: { id: string; title: string; thumbnail: string | null; url: string | null } | null
  messages: Array<{ id: string; fromAccount: boolean; text: string; at: number }>
}
interface Draft { text: string | null; source: 'ai' | 'template' | null; category: InboxCategory; needsHuman: boolean; reason: string }
interface PostView { id: string; collection: string; title: string; thumbnail: string | null; url: string | null; at: number; commentCount: number }
interface CommentView { id: string; authorUsername: string; text: string; at: number; hidden: boolean; fromAccount: boolean; category: InboxCategory }

const TABS: Array<{ id: InboxTab | 'posts'; label: string }> = [
  { id: 'pending', label: 'Cevap bekleyenler' },
  { id: 'messages', label: 'Mesajlar' },
  { id: 'comments', label: 'Yorumlar' },
  { id: 'activity', label: 'Bildirimler' },
  { id: 'posts', label: 'Paylaşımlar' },
]

const KIND_LABEL: Record<InboxItem['kind'], string> = { comment: 'Yorum', mention: 'Bahsetme', message: 'Mesaj', like: 'Beğeni', follow: 'Takip', system: 'Sistem' }

function timeAgo(ms: number): string {
  if (!ms) return ''
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 60) return 'şimdi'
  if (s < 3600) return `${Math.floor(s / 60)} dk`
  if (s < 86400) return `${Math.floor(s / 3600)} sa`
  return `${Math.floor(s / 86400)} g`
}

function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  const initials = name.replace(/\.nahaber$/i, '').slice(0, 2).toLocaleUpperCase('tr-TR')
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white" style={{ width: size, height: size }} aria-hidden="true">{initials}</span>
  )
}

function CategoryChip({ category }: { category: InboxCategory | null }) {
  if (!category) return null
  const risky = !isAutoSafe(category) && category !== 'other' && category !== 'question'
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', risky ? 'bg-red-100 text-red-800' : 'bg-violet-100 text-violet-800')}>
      {CATEGORY_TR[category]}
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function HesapMerkeziPage() {
  const { role, loading: authLoading } = useCmsAuth()
  const isSuper = role === 'super_admin'

  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [tab, setTab] = useState<InboxTab | 'posts'>('pending')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [accountQuery, setAccountQuery] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [mobilePane, setMobilePane] = useState<'accounts' | 'list' | 'detail'>('list')

  const load = useCallback(async () => {
    if (tab === 'posts') return
    setLoading(true)
    try {
      const q = new URLSearchParams({ view: 'inbox', tab })
      if (selectedUid) q.set('uid', selectedUid)
      const r = await api<{ accounts: AccountView[]; items: InboxItem[] }>(`${API}?${q}`)
      setAccounts(r.accounts)
      setItems(r.items)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [tab, selectedUid])

  useEffect(() => {
    if (isSuper) void load()
  }, [isSuper, load])

  const totals = useMemo(() => accounts.reduce(
    (t, a) => ({ c: t.c + a.counts.pendingComments, m: t.m + a.counts.unreadMessages, a: t.a + a.counts.activity }),
    { c: 0, m: 0, a: 0 },
  ), [accounts])

  const filteredAccounts = useMemo(() => {
    const q = accountQuery.trim().toLocaleLowerCase('tr-TR')
    return q ? accounts.filter((a) => a.username.toLocaleLowerCase('tr-TR').includes(q) || (a.displayName ?? '').toLocaleLowerCase('tr-TR').includes(q)) : accounts
  }, [accounts, accountQuery])

  const selectedAccount = accounts.find((a) => a.uid === selectedUid) ?? null
  const selectedItem = items.find((i) => i.key === selectedKey) ?? null

  const markAllRead = async () => {
    const groups = new Map<string, string[]>()
    for (const i of items) if (i.unread) groups.set(i.accountUid, [...(groups.get(i.accountUid) ?? []), i.key])
    if (!groups.size) return
    try {
      for (const [uid, keys] of groups) await post({ action: 'read', uid, keys })
      toast.success('Okundu olarak işaretlendi')
      void load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (authLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
  if (!isSuper) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
          <Shield className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="mt-3 text-sm text-slate-600">Hesap Merkezi yalnızca süper admin içindir.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-slate-100">
      <CMSHeader
        title="Hesap Merkezi"
        subtitle={`${accounts.length} hesap · ${totals.c + totals.m} cevap bekliyor`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void load()} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" aria-label="Yenile">
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setShowSettings(true)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-sm font-semibold text-violet-800 hover:bg-violet-100">
              <Bot className="h-4 w-4" aria-hidden="true" /> AI Asistan
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-white px-4 py-2 text-xs font-semibold sm:px-6">
        <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-800">{totals.c} yorum bekliyor</span>
        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-800">{totals.m} mesaj bekliyor</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{totals.a} beğeni / takip (özet)</span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Accounts */}
        <aside className={cn('w-full shrink-0 flex-col border-r border-slate-200 bg-white md:flex md:w-72', mobilePane === 'accounts' ? 'flex' : 'hidden')}>
          <div className="space-y-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Hesaplar ({accounts.length})</span>
              <button type="button" onClick={() => setShowAdd(true)} className="inline-flex min-h-[32px] items-center gap-1 rounded-md px-2 text-xs font-semibold text-red-700 hover:bg-red-50">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Hesap ekle
              </button>
            </div>
            <label className="relative block">
              <span className="sr-only">Hesap ara</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input value={accountQuery} onChange={(e) => setAccountQuery(e.target.value)} placeholder="Hesap ara…" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm" />
            </label>
          </div>
          <div className="flex-1 overflow-y-auto">
            <AccountRow
              active={selectedUid === null}
              name="Tüm hesaplar"
              sub={`${accounts.length} hesap`}
              pending={totals.c + totals.m}
              onClick={() => { setSelectedUid(null); setSelectedKey(null); if (tab === 'posts') setTab('pending'); setMobilePane('list') }}
            />
            {filteredAccounts.map((a) => (
              <AccountRow
                key={a.uid}
                active={selectedUid === a.uid}
                name={a.username}
                photo={a.photoURL}
                sub={[a.counts.pendingComments && `${a.counts.pendingComments} yorum`, a.counts.unreadMessages && `${a.counts.unreadMessages} mesaj`, a.counts.activity && `${a.counts.activity} diğer`].filter(Boolean).join(' · ') || 'Yeni bir şey yok'}
                pending={a.counts.pendingComments + a.counts.unreadMessages}
                onClick={() => { setSelectedUid(a.uid); setSelectedKey(null); setMobilePane('list') }}
              />
            ))}
            {!loading && accounts.length === 0 && (
              <div className="p-4 text-sm text-slate-600">
                Henüz hesap eklenmedi. <button type="button" onClick={() => setShowAdd(true)} className="font-semibold text-red-700 underline">Hesap ekle</button>
              </div>
            )}
          </div>
        </aside>

        {/* List */}
        <main className={cn('min-w-0 flex-1 flex-col border-r border-slate-200 bg-white md:flex', mobilePane === 'list' ? 'flex' : 'hidden')}>
          <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-3 py-2">
            <button type="button" onClick={() => setMobilePane('accounts')} className="mr-1 inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 md:hidden">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {selectedAccount?.username ?? 'Tüm hesaplar'}
            </button>
            <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Gelen kutusu sekmeleri">
              {TABS.filter((t) => t.id !== 'posts' || selectedUid).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => { setTab(t.id); setSelectedKey(null) }}
                  className={cn('min-h-[36px] shrink-0 rounded-lg px-3 text-sm font-semibold', tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <span className="flex-1" />
            {tab !== 'posts' && (
              <button type="button" onClick={() => void markAllRead()} className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50">
                Tümünü okundu say
              </button>
            )}
          </div>

          {tab === 'posts' && selectedUid ? (
            <PostsPanel uid={selectedUid} />
          ) : (
            <div className="flex-1 overflow-y-auto">
              {loading && items.length === 0 ? (
                <div className="space-y-2 p-4" aria-busy="true">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-100" />)}</div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-slate-500">
                  <Inbox className="h-8 w-8 text-slate-300" aria-hidden="true" />
                  Bu sekmede bekleyen bir şey yok.
                </div>
              ) : (
                items.map((it) => (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => { setSelectedKey(it.key); setMobilePane('detail') }}
                    className={cn('block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50', selectedKey === it.key && 'bg-red-50')}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-bold', it.kind === 'message' ? 'bg-blue-100 text-blue-800' : it.kind === 'comment' || it.kind === 'mention' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700')}>{KIND_LABEL[it.kind]}</span>
                      <span className="text-xs text-slate-500">{it.accountUsername}</span>
                      <span className="text-xs text-slate-400">· {timeAgo(it.at)}</span>
                      {it.unread && <span className="h-2 w-2 rounded-full bg-red-600" aria-label="okunmadı" />}
                      <span className="flex-1" />
                      <CategoryChip category={it.category} />
                    </span>
                    <span className="mt-1.5 block text-sm font-semibold text-slate-900">{it.actorUsername ? `@${it.actorUsername}` : it.actorName ?? 'NaHaber'}</span>
                    {it.text && <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-slate-600">{it.text}</span>}
                  </button>
                ))
              )}
            </div>
          )}
        </main>

        {/* Detail */}
        {tab !== 'posts' && (
          <section className={cn('w-full shrink-0 flex-col bg-slate-50 lg:flex lg:w-[440px]', mobilePane === 'detail' ? 'flex' : 'hidden')}>
            <button type="button" onClick={() => setMobilePane('list')} className="inline-flex min-h-[44px] items-center gap-1 border-b border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 lg:hidden">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Listeye dön
            </button>
            {selectedItem ? (
              <DetailPanel key={selectedItem.key} item={selectedItem} onDone={() => { setSelectedKey(null); setMobilePane('list'); void load() }} />
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-500">Soldan bir yorum veya mesaj seçin.</div>
            )}
          </section>
        )}
      </div>

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      {showAdd && (
        <AccountsDialog
          accounts={accounts}
          onClose={() => setShowAdd(false)}
          onChanged={() => void load()}
        />
      )}
    </div>
  )
}

function AccountRow({ active, name, sub, pending, photo = null, onClick }: { active: boolean; name: string; sub: string; pending: number; photo?: string | null; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex w-full items-center gap-3 border-l-[3px] px-3 py-2.5 text-left hover:bg-slate-50', active ? 'border-red-600 bg-red-50' : 'border-transparent')}>
      <Avatar src={photo} name={name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-900">{name}</span>
        <span className="block truncate text-xs text-slate-500">{sub}</span>
      </span>
      {pending > 0 && <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">{pending}</span>}
    </button>
  )
}

// ── Detail + reply ───────────────────────────────────────────────────────────

function DetailPanel({ item, onDone }: { item: InboxItem; onDone: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [text, setText] = useState('')
  const [usedDraft, setUsedDraft] = useState(false)
  const [sending, setSending] = useState(false)
  const requestId = useRef(newRequestId())
  const answerable = item.kind === 'comment' || item.kind === 'mention' || item.kind === 'message'

  useEffect(() => {
    let alive = true
    api<Detail>(`${API}?${new URLSearchParams({ view: 'detail', uid: item.accountUid, key: item.key })}`)
      .then((d) => alive && setDetail(d))
      .catch((e) => toast.error((e as Error).message))
    if (item.unread && !answerable) void post({ action: 'read', uid: item.accountUid, keys: [item.key] }).catch(() => undefined)
    return () => { alive = false }
  }, [item, answerable])

  const askDraft = async () => {
    setDrafting(true)
    try {
      setDraft(await post<Draft>({ action: 'draft', uid: item.accountUid, key: item.key }))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDrafting(false)
    }
  }

  const sendReply = async () => {
    if (!text.trim()) return
    setSending(true)
    try {
      await post({ action: 'reply', uid: item.accountUid, key: item.key, text, requestId: requestId.current, source: usedDraft ? 'ai_draft' : 'editor' })
      toast.success(`${item.accountUsername} adına gönderildi`)
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
      requestId.current = newRequestId()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-slate-200 bg-white px-5 py-4">
        <div className="text-xs text-slate-500">{KIND_LABEL[item.kind]} · {item.accountUsername}</div>
        <div className="mt-0.5 text-base font-bold text-slate-900">{item.actorUsername ? `@${item.actorUsername}` : item.actorName ?? 'NaHaber'}</div>
        {detail?.content && (
          <a href={detail.content.url ?? '#'} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
            {detail.content.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={detail.content.thumbnail} alt="" className="h-10 w-14 shrink-0 rounded object-cover" />
            ) : <Newspaper className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />}
            <span className="line-clamp-2 text-xs text-slate-700">{detail.content.title || 'İlgili paylaşım'}</span>
          </a>
        )}
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
        {item.kind === 'message' ? (
          detail ? detail.messages.map((m) => (
            <div key={m.id} className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug', m.fromAccount ? 'ml-auto rounded-br-md bg-slate-900 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800')}>
              {m.text}
              <div className={cn('mt-1 text-[10px]', m.fromAccount ? 'text-slate-300' : 'text-slate-400')}>{timeAgo(m.at)}</div>
            </div>
          )) : <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
        ) : item.text ? (
          <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 text-sm leading-snug text-slate-800">{item.text}</div>
        ) : (
          <p className="text-sm text-slate-500">{KIND_LABEL[item.kind]} bildirimi — cevap gerektirmez.</p>
        )}

        {answerable && (
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Bot className="h-4 w-4 text-violet-700" aria-hidden="true" />
              <span className="text-xs font-bold text-violet-800">AI taslak cevap</span>
              {draft && <CategoryChip category={draft.category} />}
            </div>
            {draft ? (
              <>
                {draft.text ? <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-indigo-950">{draft.text}</p> : <p className="mt-2 text-[13px] text-violet-900">Bu mesaj için hazır cevap önerilmiyor; kendiniz yazın.</p>}
                {draft.needsHuman && <p className="mt-1 text-[11px] font-semibold text-red-700">Kişi incelemeli: göndermeden önce dikkatle okuyun.</p>}
                {draft.reason === 'ai_off' && <p className="mt-1 text-[11px] text-violet-800">AI kapalı — sabit şablon gösteriliyor.</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {draft.text && (
                    <button type="button" onClick={() => { setText(draft.text ?? ''); setUsedDraft(true) }} className="min-h-[36px] rounded-lg bg-violet-700 px-3 text-xs font-semibold text-white hover:bg-violet-800">Taslağı kullan</button>
                  )}
                  <button type="button" onClick={() => void askDraft()} disabled={drafting} className="min-h-[36px] rounded-lg border border-violet-200 bg-white px-3 text-xs font-semibold text-violet-800 disabled:opacity-60">Yeniden yaz</button>
                </div>
              </>
            ) : (
              <button type="button" onClick={() => void askDraft()} disabled={drafting} className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-violet-700 px-3 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-60">
                {drafting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Taslak hazırla
              </button>
            )}
          </div>
        )}
      </div>

      {answerable && (
        <div className="border-t border-slate-200 bg-white px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-700">
            <span className="h-2 w-2 rounded-full bg-red-600" aria-hidden="true" />
            Şu hesap adına cevaplıyorsun: <strong>{item.accountUsername}</strong>
          </div>
          <label htmlFor="ac-reply" className="sr-only">Cevap</label>
          <textarea
            id="ac-reply"
            rows={3}
            value={text}
            maxLength={REPLY_MAX_LENGTH}
            onChange={(e) => { setText(e.target.value); if (!e.target.value) setUsedDraft(false) }}
            placeholder="Cevabını yaz…"
            className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">Cevabı yazan admin denetim kaydına işlenir.</span>
            <button type="button" onClick={() => void sendReply()} disabled={sending || !text.trim()} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />} Gönder
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Posts (Aşama 3) ──────────────────────────────────────────────────────────

function PostsPanel({ uid }: { uid: string }) {
  const [posts, setPosts] = useState<PostView[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    setPosts(null)
    api<{ posts: PostView[] }>(`${API}?${new URLSearchParams({ view: 'posts', uid })}`).then((r) => setPosts(r.posts)).catch((e) => { toast.error((e as Error).message); setPosts([]) })
  }, [uid])
  if (!posts) return <div className="space-y-2 p-4" aria-busy="true">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}</div>
  if (!posts.length) return <div className="p-10 text-center text-sm text-slate-500">Bu hesabın yayımlanmış paylaşımı yok.</div>
  return (
    <div className="flex-1 overflow-y-auto">
      {posts.map((p) => (
        <div key={p.id} className="border-b border-slate-100">
          <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" aria-expanded={open === p.id}>
            {p.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.thumbnail} alt="" className="h-12 w-16 shrink-0 rounded object-cover" />
            ) : <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-slate-100"><Newspaper className="h-5 w-5 text-slate-400" aria-hidden="true" /></span>}
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-sm font-semibold text-slate-900">{p.title || 'Başlıksız paylaşım'}</span>
              <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">{timeAgo(p.at)} <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> {p.commentCount}</span>
            </span>
          </button>
          {open === p.id && <PostComments uid={uid} postId={p.id} url={p.url} />}
        </div>
      ))}
    </div>
  )
}

function PostComments({ uid, postId, url }: { uid: string; postId: string; url: string | null }) {
  const [comments, setComments] = useState<CommentView[] | null>(null)
  const load = useCallback(() => {
    api<{ comments: CommentView[] }>(`${API}?${new URLSearchParams({ view: 'comments', uid, postId })}`).then((r) => setComments(r.comments)).catch((e) => { toast.error((e as Error).message); setComments([]) })
  }, [uid, postId])
  useEffect(load, [load])
  const toggle = async (c: CommentView) => {
    try {
      await post({ action: 'hide', uid, commentId: c.id, hidden: !c.hidden })
      toast.success(c.hidden ? 'Yorum tekrar görünür' : 'Yorum gizlendi')
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <div className="bg-slate-50 px-4 pb-3">
      {url && <a href={url} target="_blank" rel="noreferrer" className="mb-2 inline-block text-xs font-semibold text-red-700 underline">Paylaşımı aç</a>}
      {!comments ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : comments.length === 0 ? <p className="text-xs text-slate-500">Yorum yok.</p> : (
        <ul className="space-y-1.5">
          {comments.map((c) => (
            <li key={c.id} className={cn('flex items-start gap-2 rounded-lg border bg-white p-2.5', c.hidden ? 'border-dashed border-slate-300 opacity-60' : 'border-slate-200')}>
              <span className="min-w-0 flex-1 text-[13px] leading-snug">
                <span className="font-semibold text-slate-900">@{c.authorUsername}</span> <span className="text-slate-400">· {timeAgo(c.at)}</span> <CategoryChip category={c.category === 'other' ? null : c.category} />
                <span className="mt-0.5 block text-slate-700">{c.text}</span>
              </span>
              {!c.fromAccount && (
                <button type="button" onClick={() => void toggle(c)} className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-50" aria-label={c.hidden ? 'Yorumu tekrar göster' : 'Yorumu gizle'}>
                  {c.hidden ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />} {c.hidden ? 'Göster' : 'Gizle'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Dialogs ──────────────────────────────────────────────────────────────────

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-slate-100" aria-label="Kapat"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

function AccountsDialog({ accounts, onClose, onChanged }: { accounts: AccountView[]; onClose: () => void; onChanged: () => void }) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    const names = [...new Set(query.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))].slice(0, 100)
    if (!names.length) return
    setBusy(true)
    const failed: string[] = []
    let added = 0
    for (const name of names) {
      try {
        await post({ action: 'add_account', query: name })
        added++
      } catch (e) {
        failed.push(`${name}: ${(e as Error).message}`)
      }
    }
    setBusy(false)
    if (added) toast.success(`${added} hesap eklendi`)
    if (failed.length) toast.error(failed.slice(0, 5).join('\n'), { duration: 8000 })
    setQuery(failed.map((f) => f.split(':')[0]).join('\n'))
    onChanged()
  }
  const remove = async (a: AccountView) => {
    if (!window.confirm(`${a.username} Hesap Merkezi'nden çıkarılsın mı? Hesabın kendisi silinmez.`)) return
    try {
      await post({ action: 'remove_account', uid: a.uid })
      toast.success('Çıkarıldı')
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <Dialog title="Yönetilen hesaplar" onClose={onClose}>
      <p className="text-sm text-slate-600">Kullanıcı adlarını (ör. <code>bursa.nahaber</code>) veya UID&apos;leri yazın; birden fazlası için virgül ya da alt satır kullanın. Her biri birebir eşleştirilir; ekip hesapları eklenemez.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        <label className="flex-1">
          <span className="sr-only">Kullanıcı adları veya UID&apos;ler</span>
          <textarea rows={3} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={'istanbul.nahaber\nbursa.nahaber, ankara.nahaber'} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
        </label>
        <button type="button" onClick={() => void add()} disabled={busy} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Ekle
        </button>
      </div>
      <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {accounts.map((a) => (
          <li key={a.uid} className="flex items-center gap-3 px-3 py-2">
            <Avatar src={a.photoURL} name={a.username} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{a.username}</span>
              <span className="block truncate font-mono text-[11px] text-slate-400">{a.uid}</span>
            </span>
            <button type="button" onClick={() => void remove(a)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700" aria-label={`${a.username} hesabını çıkar`}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
        {accounts.length === 0 && <li className="px-3 py-4 text-sm text-slate-500">Liste boş.</li>}
      </ul>
    </Dialog>
  )
}

const MODE_LABEL = { off: 'Kapalı', draft: 'Taslak öner', auto: 'Otomatik' } as const
const AUTO_CATS: InboxCategory[] = ['thanks', 'link_request', 'contact']
const HUMAN_CATS: InboxCategory[] = ['question', 'complaint', 'spam', 'abuse', 'political', 'sensitive', 'legal']

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<AccountCenterSettings | null>(null)
  const [autoEnv, setAutoEnv] = useState(false)
  const [aiDrafts, setAiDrafts] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    api<{ settings: AccountCenterSettings; autoEnv: boolean; aiDrafts: boolean }>(`${API}?view=settings`)
      .then((r) => { setS(r.settings); setAutoEnv(r.autoEnv); setAiDrafts(r.aiDrafts) })
      .catch((e) => toast.error((e as Error).message))
  }, [])
  const save = async () => {
    if (!s) return
    setSaving(true)
    try {
      const r = await post<{ settings: AccountCenterSettings }>({ action: 'settings', settings: s })
      setS(r.settings)
      toast.success('Kaydedildi')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  const Seg = ({ value, onChange, label }: { value: AccountCenterSettings['commentMode']; onChange: (v: AccountCenterSettings['commentMode']) => void; label: string }) => (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      <div className="inline-flex gap-0.5 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label={label}>
        {(['off', 'draft', 'auto'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={value === m} onClick={() => onChange(m)} className={cn('min-h-[36px] rounded-lg px-3 text-xs font-semibold', value === m ? 'bg-white text-violet-800 shadow-sm' : 'text-slate-600')}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>
    </div>
  )
  return (
    <Dialog title="AI Asistan ayarları" onClose={onClose}>
      {!s ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /> : (
        <div className="space-y-5">
          <div className={cn('rounded-xl border p-3 text-[13px] leading-relaxed', autoEnv ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900')}>
            {autoEnv
              ? 'Otomatik cevap anahtarı sunucuda açık. Aşağıda «Otomatik» seçilen kanallarda güvenli türlere şablon cevap gider.'
              : 'Otomatik cevap anahtarı sunucuda KAPALI (ACCOUNT_CENTER_AUTO_REPLY). «Otomatik» seçseniz bile hiçbir cevap kendiliğinden gönderilmez; taslaklar çalışır.'}
            <br />AI taslakları: <strong>{aiDrafts ? 'açık' : 'kapalı (sabit şablonlar kullanılır)'}</strong>. Taslak yalnızca siz «Taslak hazırla» dediğinizde üretilir.
          </div>

          <section className="space-y-3">
            <Seg label="Yorumlar" value={s.commentMode} onChange={(v) => setS({ ...s, commentMode: v })} />
            <Seg label="Mesajlar" value={s.dmMode} onChange={(v) => setS({ ...s, dmMode: v })} />
          </section>

          <section>
            <h3 className="text-sm font-bold text-slate-900">Otomatik cevaplanabilecek türler</h3>
            <p className="mt-1 text-xs text-slate-600">Otomatik cevap AI metni değil, sabit kısa şablondur ve sonuna «{AUTO_REPLY_FOOTER}» eklenir.</p>
            <div className="mt-2 space-y-1.5">
              {AUTO_CATS.map((c) => (
                <label key={c} className="flex min-h-[40px] items-center gap-3 rounded-lg border border-slate-200 px-3">
                  <input type="checkbox" checked={s.autoCategories.includes(c)} onChange={(e) => setS({ ...s, autoCategories: e.target.checked ? [...s.autoCategories, c] : s.autoCategories.filter((x) => x !== c) })} className="h-4 w-4 accent-violet-700" />
                  <span className="text-sm">{CATEGORY_TR[c]}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Her zaman bir kişiye gider (kilitli): </span>
              {HUMAN_CATS.map((c) => CATEGORY_TR[c]).join(', ')}.
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-600">Hesap başına günlük otomatik cevap
              <input type="number" min={1} max={200} value={s.dailyLimit} onChange={(e) => setS({ ...s, dailyLimit: Number(e.target.value) })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-slate-600">İki otomatik cevap arası (saniye)
              <input type="number" min={30} max={3600} value={s.minIntervalSec} onChange={(e) => setS({ ...s, minIntervalSec: Number(e.target.value) })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
          </section>

          <label className="flex min-h-[44px] items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3">
            <input type="checkbox" checked={s.paused} onChange={(e) => setS({ ...s, paused: e.target.checked })} className="h-4 w-4 accent-red-600" />
            <span className="text-sm font-semibold text-red-800">Acil durdur — otomatik cevapları hemen kes</span>
          </label>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500">{s.updatedAt ? `Son değişiklik: ${new Date(s.updatedAt).toLocaleString('tr-TR')}` : 'Henüz değiştirilmedi'}</span>
            <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Settings2 className="h-4 w-4" aria-hidden="true" />} Kaydet
            </button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

