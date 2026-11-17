'use client'

/**
 * Social inbox: direct messages (Instagram / Messenger) and the per-account
 * reply settings. Comments are answered on the «Yorumlar» tab. Central social
 * managers only (the API refuses everyone else).
 */
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Inbox, Loader2, PauseCircle, PlayCircle, RefreshCw, Settings2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { socialApi } from '@/components/social/socialClient'
import { PLATFORM_TR } from '@/lib/social/engagement/model'
import {
  AUTO_BLOCK_TR,
  AUTO_SAFE_CATEGORIES,
  CATEGORY_TR,
  DM_MAX,
  type AutoBlock,
  type InboxCategory,
  type InboxMode,
  type InboxSettings,
  type ReplySummary,
} from '@/lib/social/inbox/model'
import { cn } from '@/lib/utils'
import { ReplyComposer, type DraftView } from './ReplyComposer'

type Platform = 'instagram' | 'facebook' | 'threads' | 'youtube'
type Window = 'open' | 'human_agent' | 'closed'
type Conv = {
  conversationId: string
  accountId: string
  accountName: string | null
  platform: Platform
  participantId: string
  participantName: string | null
  participantUsername: string | null
  lastMessageAt: number
  lastInboundAt: number | null
  preview: string
  unread: number
  status: 'open' | 'done'
  window: Window
  category?: InboxCategory | null
  draft?: DraftView
  autoBlock?: AutoBlock | null
  reply?: ReplySummary | null
}
type Msg = { messageId: string; direction: 'in' | 'out'; text: string; at: number; source?: string; deleted?: boolean }
type AccountRow = {
  accountId: string
  platform: Platform
  connectionMethod: string
  name: string
  status: string
  citySlug: string | null
  central: boolean
  reply: 'granted' | 'missing' | 'unknown' | 'unsupported'
  messages: 'granted' | 'missing' | 'unknown' | 'unsupported'
  missing: string[]
  settings: InboxSettings
  messagesSubscribedAt: number | null
}

const fmt = (t: number | null) => (t ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const CAP_TR = { granted: 'izin var', missing: 'izin gerekiyor', unknown: 'doğrulanmadı', unsupported: 'platform desteklemiyor' } as const
const MODE_TR: Record<InboxMode, string> = { off: 'Kapalı (yalnız elle)', draft: 'Taslak hazırla', auto: 'Güvenli olanlara otomatik cevap' }
const WINDOW_TR: Record<Window, string> = {
  open: '24 saatlik pencere açık',
  human_agent: '24 saat geçti — yalnız editör cevabı (7 güne kadar)',
  closed: 'Mesaj penceresi kapalı — kişi yeniden yazana kadar cevap gönderilemez',
}

export function SocialInboxPanel() {
  const [tab, setTab] = useState<'messages' | 'settings'>('messages')
  return (
    <section className="space-y-3">
      <div className="flex gap-1.5" role="tablist">
        {(
          [
            ['messages', 'Mesajlar', Inbox],
            ['settings', 'Otomatik cevap ayarları', Settings2],
          ] as const
        ).map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold', tab === k ? 'bg-[rgb(var(--color-brand))] text-white' : 'border border-[rgb(var(--color-border))]')}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {tab === 'messages' ? <Messages /> : <SettingsPanel />}
    </section>
  )
}

function Messages() {
  const [status, setStatus] = useState<'open' | 'done' | 'all'>('open')
  const [list, setList] = useState<Conv[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ conversation: Conv; messages: Msg[] } | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const r = await socialApi<{ conversations: Conv[] }>(`/api/admin/social/inbox/conversations?status=${status}`)
    if (!r.ok) return setError(r.status === 403 ? 'Bu ekran yalnız merkez sosyal medya yöneticilerine açık.' : 'Mesajlar yüklenemedi.')
    setList(r.data.conversations)
  }, [status])
  const open = useCallback(async (id: string) => {
    setSel(id)
    setDetail(null)
    const r = await socialApi<{ conversation: Conv; messages: Msg[] }>(`/api/admin/social/inbox/conversations?id=${encodeURIComponent(id)}`)
    if (r.ok) setDetail(r.data)
    else toast.error('Konuşma açılamadı.')
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const setDone = async (id: string, done: boolean) => {
    const r = await socialApi('/api/admin/social/inbox/conversations', { method: 'POST', body: JSON.stringify({ action: done ? 'done' : 'reopen', id }) })
    if (!r.ok) return toast.error('Güncellenemedi.')
    void load()
    if (sel === id) void open(id)
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <div className="space-y-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3">
        <div className="flex items-center gap-1.5">
          {(['open', 'done', 'all'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)} className={cn('rounded-lg px-2.5 py-1 text-xs font-semibold', status === s ? 'bg-blue-600 text-white' : 'border border-[rgb(var(--color-border))]')}>
              {s === 'open' ? 'Açık' : s === 'done' ? 'Tamamlanan' : 'Tümü'}
            </button>
          ))}
          <button type="button" onClick={() => void load()} className="ml-auto rounded-lg border border-[rgb(var(--color-border))] p-1" aria-label="Yenile">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        {error ? <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
        {!list && !error ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {list && list.length === 0 ? (
          <p className="text-sm text-[rgb(var(--color-muted))]">Mesaj yok. Mesajların gelmesi için hesabın «Mesaj ve cevap izni» vermiş ve «Mesaj bildirimlerini aç» adımının yapılmış olması gerekir (Ayarlar sekmesi).</p>
        ) : null}
        <ul className="space-y-1">
          {(list ?? []).map((c) => (
            <li key={c.conversationId}>
              <button type="button" onClick={() => void open(c.conversationId)} className={cn('w-full rounded-lg border p-2 text-left text-sm', sel === c.conversationId ? 'border-blue-500' : 'border-[rgb(var(--color-border))]')}>
                <span className="flex items-center gap-1.5 text-xs text-[rgb(var(--color-muted))]">
                  <b className="text-[rgb(var(--color-text))]">{c.participantUsername ? `@${c.participantUsername}` : c.participantName ?? 'Kullanıcı'}</b> · {PLATFORM_TR[c.platform]} {c.accountName ?? ''}
                  {c.unread ? <span className="ml-auto rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">{c.unread}</span> : null}
                </span>
                <span className="block truncate">{c.preview}</span>
                <span className="block text-[11px] text-[rgb(var(--color-muted))]">
                  {fmt(c.lastMessageAt)}
                  {c.category ? ` · ${CATEGORY_TR[c.category]}` : ''}
                  {c.reply ? ` · cevap: ${c.reply.status === 'sent' ? 'gönderildi' : c.reply.status}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3">
        {!sel ? <p className="text-sm text-[rgb(var(--color-muted))]">Soldan bir konuşma seçin.</p> : null}
        {sel && !detail ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {detail ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <b>{detail.conversation.participantUsername ? `@${detail.conversation.participantUsername}` : detail.conversation.participantName ?? 'Kullanıcı'}</b>
              <span className="text-xs text-[rgb(var(--color-muted))]">{PLATFORM_TR[detail.conversation.platform]} · {WINDOW_TR[detail.conversation.window]}</span>
              <button type="button" onClick={() => void setDone(detail.conversation.conversationId, detail.conversation.status !== 'done')} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" /> {detail.conversation.status === 'done' ? 'Yeniden aç' : 'Tamamlandı'}
              </button>
            </div>
            <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
              {detail.messages.map((m) => (
                <li key={m.messageId} className={cn('max-w-[85%] rounded-xl px-3 py-1.5 text-sm', m.direction === 'in' ? 'bg-[rgb(var(--color-border))]/40' : 'ml-auto bg-blue-600 text-white')}>
                  <span className="whitespace-pre-wrap break-words">{m.deleted ? '(silindi)' : m.text}</span>
                  <span className={cn('block text-[10px]', m.direction === 'in' ? 'text-[rgb(var(--color-muted))]' : 'text-blue-100')}>
                    {fmt(m.at)}
                    {m.source === 'auto' ? ' · otomatik' : m.source === 'platform' ? ' · platformdan' : ''}
                  </span>
                </li>
              ))}
            </ul>
            <ReplyComposer
              key={detail.conversation.conversationId + (detail.conversation.reply?.replyId ?? '')}
              endpoint="/api/admin/social/inbox/conversations"
              itemId={detail.conversation.conversationId}
              maxLength={DM_MAX}
              draft={detail.conversation.draft ?? null}
              category={detail.conversation.category}
              autoBlockText={detail.conversation.autoBlock && detail.conversation.autoBlock !== 'mode_off' ? AUTO_BLOCK_TR[detail.conversation.autoBlock] : null}
              reply={detail.conversation.reply}
              disabledReason={detail.conversation.window === 'closed' ? WINDOW_TR.closed : null}
              onDone={() => {
                void open(detail.conversation.conversationId)
                void load()
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function SettingsPanel() {
  const [data, setData] = useState<{ accounts: AccountRow[]; global: { env: boolean; paused: boolean; enabled: boolean }; webhookConfigured: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, InboxSettings>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await socialApi<NonNullable<typeof data>>('/api/admin/social/inbox/settings')
    if (!r.ok) return setError(r.status === 403 ? 'Bu ekran yalnız merkez sosyal medya yöneticilerine açık.' : 'Ayarlar yüklenemedi.')
    setData(r.data)
    setEdits({})
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const post = async (key: string, body: Record<string, unknown>, okText: string) => {
    setBusy(key)
    const r = await socialApi('/api/admin/social/inbox/settings', { method: 'POST', body: JSON.stringify(body) })
    setBusy(null)
    if (!r.ok) {
      toast.error(body.action === 'subscribe' ? 'Mesaj bildirimleri açılamadı — hesabın mesaj izni ve Meta uygulamasının webhook ayarı gerekli.' : 'Kaydedilemedi.')
      return
    }
    toast.success(okText)
    void load()
  }

  if (error) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
  if (!data) return <Loader2 className="h-4 w-4 animate-spin" />
  const g = data.global

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 text-sm">
        <p>
          <b>Otomatik cevap (genel):</b>{' '}
          {g.enabled ? <span className="text-emerald-700">açık</span> : <span className="text-amber-700">kapalı</span>}
          {!g.env ? ' — sunucuda SOCIAL_INBOX_AUTO_REPLY=on tanımlı değil; hesaplar «otomatik» seçse bile yalnız taslak hazırlanır.' : ''}
          {g.env && g.paused ? ' — panelden durduruldu.' : ''}
        </p>
        <button type="button" disabled={busy === 'global'} onClick={() => void post('global', { action: 'global_pause', paused: !g.paused }, g.paused ? 'Otomatik cevap yeniden açıldı.' : 'Tüm otomatik cevaplar durduruldu.')} className={cn('inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold', g.paused ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white')}>
          {g.paused ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />} {g.paused ? 'Otomatik cevabı yeniden aç' : 'Tüm otomatik cevapları durdur'}
        </button>
        <p className="text-xs text-[rgb(var(--color-muted))]">
          Otomatik cevap yalnız şu türlere verilir: {AUTO_SAFE_CATEGORIES.map((c) => CATEGORY_TR[c]).join(', ')} — hazır, onaylı kalıp metinle (AI metni kendiliğinden gönderilmez). Şikâyet, hakaret,
          hukuki, siyasi, hassas konular ve hassas haberlerin yorumları her zaman editöre kalır. Aynı kişiye günde en fazla bir otomatik cevap, 6 saatten eski öğelere hiç verilmez.
        </p>
        <p className="text-xs text-[rgb(var(--color-muted))]">
          Özel mesajlar için Meta uygulamasında webhook: <code>https://www.nahaber.com/api/social/webhooks/meta</code> · doğrulama belirteci {data.webhookConfigured ? 'tanımlı' : <b className="text-amber-700">tanımlı değil (SOCIAL_META_WEBHOOK_VERIFY_TOKEN)</b>} · alan: <code>messages</code>
        </p>
      </div>

      {data.accounts.length === 0 ? <p className="text-sm text-[rgb(var(--color-muted))]">OAuth ile bağlı hesap yok.</p> : null}
      <ul className="space-y-2">
        {data.accounts.map((a) => {
          const s = edits[a.accountId] ?? a.settings
          const set = (patch: Partial<InboxSettings>) => setEdits((cur) => ({ ...cur, [a.accountId]: { ...s, ...patch } }))
          const dirty = !!edits[a.accountId]
          const dmSupported = a.messages !== 'unsupported'
          return (
            <li key={a.accountId} className="space-y-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <b>{a.name}</b>
                <span className="text-xs text-[rgb(var(--color-muted))]">
                  {PLATFORM_TR[a.platform]} · {a.central ? 'merkez' : a.citySlug ?? '—'} · yorum cevabı: {CAP_TR[a.reply]}
                  {dmSupported ? ` · özel mesaj: ${CAP_TR[a.messages]}` : ''}
                  {a.status !== 'active' ? ` · hesap ${a.status}` : ''}
                </span>
              </p>
              {a.missing.length ? <p className="text-xs text-amber-700">Eksik izin: {a.missing.join(', ')} — Hesaplar sekmesinde «Mesaj ve cevap izni ver».</p> : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs">
                  Yorumlar
                  <select value={s.commentMode} onChange={(e) => set({ commentMode: e.target.value as InboxMode })} className="mt-0.5 w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent p-1.5 text-sm">
                    {(['off', 'draft', 'auto'] as const).map((m) => (
                      <option key={m} value={m}>{MODE_TR[m]}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  Özel mesajlar
                  <select disabled={!dmSupported} value={dmSupported ? s.dmMode : 'off'} onChange={(e) => set({ dmMode: e.target.value as InboxMode })} className="mt-0.5 w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent p-1.5 text-sm disabled:opacity-50">
                    {(['off', 'draft', 'auto'] as const).map((m) => (
                      <option key={m} value={m}>{dmSupported ? MODE_TR[m] : 'Platform desteklemiyor'}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span>Otomatik cevaplanacak türler:</span>
                {AUTO_SAFE_CATEGORIES.map((c) => (
                  <label key={c} className="inline-flex items-center gap-1">
                    <input type="checkbox" checked={s.autoCategories.includes(c)} onChange={() => set({ autoCategories: s.autoCategories.includes(c) ? s.autoCategories.filter((x) => x !== c) : [...s.autoCategories, c] })} />
                    {CATEGORY_TR[c]}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="inline-flex items-center gap-1">
                  Günlük sınır
                  <input type="number" min={1} max={200} value={s.dailyLimit} onChange={(e) => set({ dailyLimit: Number(e.target.value) })} className="w-16 rounded border border-[rgb(var(--color-border))] bg-transparent p-1" />
                </label>
                <label className="inline-flex items-center gap-1">
                  En az aralık (sn)
                  <input type="number" min={30} max={3600} value={s.minIntervalSec} onChange={(e) => set({ minIntervalSec: Number(e.target.value) })} className="w-20 rounded border border-[rgb(var(--color-border))] bg-transparent p-1" />
                </label>
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={s.paused} onChange={() => set({ paused: !s.paused })} /> Bu hesapta otomatik cevabı durdur
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" disabled={!dirty || busy === `s:${a.accountId}`} onClick={() => void post(`s:${a.accountId}`, { action: 'save', accountId: a.accountId, settings: s }, 'Ayarlar kaydedildi.')} className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
                  Kaydet
                </button>
                {(a.platform === 'instagram' || a.platform === 'facebook') && a.messages !== 'missing' ? (
                  <button type="button" disabled={busy === `w:${a.accountId}`} onClick={() => void post(`w:${a.accountId}`, { action: 'subscribe', accountId: a.accountId }, 'Mesaj bildirimleri açıldı.')} className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-1 text-xs">
                    {a.messagesSubscribedAt ? `Mesaj bildirimleri açık (${fmt(a.messagesSubscribedAt)}) — yenile` : 'Mesaj bildirimlerini aç'}
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
