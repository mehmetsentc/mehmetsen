'use client'

import { useState, useEffect, useCallback } from 'react'
import { Mail, Shield, RefreshCw, ExternalLink, Inbox, FileText, AlertCircle, WifiOff, LogOut, ChevronRight } from 'lucide-react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { cn } from '@/lib/utils'
import type { GmailMessageSummary, GmailMessageDetail } from '@/lib/gmail/types'
import { auth } from '@/lib/firebase/auth'

/** Returns current user's Firebase ID token for API calls */
async function getToken(): Promise<string> {
  return (await auth.currentUser?.getIdToken()) ?? ''
}

/** Authenticated fetch wrapper */
async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await getToken()
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  })
}

// ── Types ──────────────────────────────────────────────────────────────────

interface StatusData {
  connected: boolean
  accountEmail?: string
  connectedAt?: number
  connectedBy?: string
}

// ── Helper ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return dateStr
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function NotConnectedState({ canManage }: { canManage: boolean }) {
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

  async function handleConnect() {
    setConnecting(true)
    setConnectError('')
    try {
      const r = await authFetch('/api/admin/gmail/connect')
      const d = await r.json()
      if (!r.ok || d.error) throw new Error(d.error ?? 'Bağlantı başlatılamadı')
      // Redirect to Google OAuth consent screen
      window.location.href = d.authUrl
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : 'Bağlantı hatası')
      setConnecting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <section className="rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-6 sm:p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--color-brand))]/10">
          <Mail className="h-6 w-6 text-[rgb(var(--color-brand))]" />
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-tight text-[rgb(var(--color-text))]">
          Gmail bağlantısı gerekli
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
          Haber odası gelen kutusu, <strong className="text-[rgb(var(--color-text))]">bilgi@nahaber.com</strong>{' '}
          hesabını Google OAuth ile güvenli şekilde bağladıktan sonra burada görünecek.
          Şifre saklanmaz; erişim sunucu tarafında token ile yönetilir.
        </p>

        <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <Shield className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Yalnızca bilgi@nahaber.com hesabı kabul edilir. Farklı bir hesap seçilirse bağlantı reddedilir.</p>
          </div>
        </div>

        {connectError && (
          <p className="mt-3 text-sm text-red-400">{connectError}</p>
        )}

        {canManage ? (
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {connecting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {connecting ? 'Yönlendiriliyor…' : 'Gmail Bağla'}
          </button>
        ) : (
          <p className="mt-4 text-sm text-[rgb(var(--color-muted))]">
            Bağlantıyı yalnızca süper admin veya sistem ayarı yetkisi olanlar yapılandırabilir.
          </p>
        )}
      </section>
    </div>
  )
}

function WrongEnvState() {
  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <div className="rounded-[14px] border border-red-500/20 bg-red-500/[0.05] p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <div>
            <p className="text-sm font-semibold text-[rgb(var(--color-text))]">Yapılandırma eksik</p>
            <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
              GMAIL_CLIENT_ID veya GMAIL_CLIENT_SECRET env değişkeni ayarlanmamış. Vercel ortam değişkenlerini kontrol edin.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageRow({
  msg,
  selected,
  onClick,
}: {
  msg: GmailMessageSummary
  selected: boolean
  onClick: () => void
}) {
  const isUnread = msg.labelIds.includes('UNREAD')
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full border-b border-[rgb(var(--color-border))] px-4 py-3 text-left transition-colors hover:bg-[rgb(var(--color-surface))]',
        selected && 'bg-[rgb(var(--color-brand))]/5',
      )}
    >
      <div className="flex items-start gap-2">
        {isUnread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[rgb(var(--color-brand))]" />}
        {!isUnread && <span className="mt-1.5 h-2 w-2 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={cn('truncate text-sm', isUnread ? 'font-semibold text-[rgb(var(--color-text))]' : 'text-[rgb(var(--color-muted))]')}>
              {msg.from.replace(/<[^>]+>/, '').trim() || msg.from}
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-[rgb(var(--color-muted))]">
              {formatDate(msg.date)}
            </span>
          </div>
          <p className={cn('mt-0.5 truncate text-sm', isUnread ? 'font-medium text-[rgb(var(--color-text))]' : 'text-[rgb(var(--color-muted))]')}>
            {msg.subject}
          </p>
          <p className="mt-0.5 truncate text-xs text-[rgb(var(--color-muted))]">{msg.snippet}</p>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" />
      </div>
    </button>
  )
}

function MessageDetail({
  messageId,
  canCreate,
  onClose,
}: {
  messageId: string
  canCreate: boolean
  onClose: () => void
}) {
  const [msg, setMsg] = useState<GmailMessageDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [converting, setConverting] = useState(false)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setMsg(null)
    setDraftId(null)
    setError('')
    authFetch(`/api/admin/gmail/messages/${messageId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setMsg(d)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [messageId])

  async function convertToDraft() {
    if (!canCreate || converting) return
    setConverting(true)
    try {
      const r = await authFetch(`/api/admin/gmail/messages/${messageId}/to-draft`, { method: 'POST' })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setDraftId(d.draftId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dönüştürme başarısız')
    } finally {
      setConverting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-400">{error}</p>
        <button onClick={onClose} className="mt-3 text-sm text-[rgb(var(--color-brand))] hover:underline">← Geri</button>
      </div>
    )
  }
  if (!msg) return null

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-[rgb(var(--color-border))] px-4 py-3">
        <button onClick={onClose} className="mb-2 text-xs text-[rgb(var(--color-brand))] hover:underline">← Geri</button>
        <h2 className="text-base font-bold text-[rgb(var(--color-text))]">{msg.subject}</h2>
        <p className="mt-0.5 text-xs text-[rgb(var(--color-muted))]">
          {msg.from} · {formatDate(msg.date)}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-[rgb(var(--color-text))]">
          {msg.body || '(içerik yok)'}
        </pre>
      </div>

      {canCreate && (
        <div className="shrink-0 border-t border-[rgb(var(--color-border))] px-4 py-3">
          {draftId ? (
            <div className="flex items-center gap-2 text-sm text-emerald-500">
              <FileText className="h-4 w-4" />
              <span>Taslak oluşturuldu — onay kuyruğuna eklendi</span>
              <a href="/admin/news?filter=pending" className="ml-auto font-semibold underline">Görüntüle</a>
            </div>
          ) : (
            <button
              type="button"
              onClick={convertToDraft}
              disabled={converting}
              className="flex items-center gap-2 rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {converting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Habere Dönüştür (Taslak)
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function AdminInboxPage() {
  const { can, role } = useCmsAuth()
  const canManage = role === 'super_admin' || role === 'managing_editor' || can('system:settings')
  const canRead = can('news:read')
  const canCreate = can('news:create')

  const [status, setStatus] = useState<StatusData | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [messages, setMessages] = useState<GmailMessageSummary[]>([])
  const [msgLoading, setMsgLoading] = useState(false)
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [envMissing, setEnvMissing] = useState(false)

  // Check URL for post-OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === '1') {
      // Clean URL without reload
      window.history.replaceState({}, '', '/admin/inbox')
    }
    const err = params.get('error')
    if (err) {
      window.history.replaceState({}, '', '/admin/inbox')
    }
  }, [])

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const r = await authFetch('/api/admin/gmail/status')
      if (r.status === 500) { setEnvMissing(true); return }
      const d = await r.json()
      setStatus(d)
    } catch {
      setEnvMissing(true)
    } finally {
      setStatusLoading(false)
    }
  }, [])

  const fetchMessages = useCallback(async (pageToken?: string) => {
    setMsgLoading(true)
    try {
      const url = `/api/admin/gmail/messages?maxResults=25${pageToken ? `&pageToken=${pageToken}` : ''}`
      const r = await authFetch(url)
      const d = await r.json()
      if (d.error) return
      setMessages((prev) => pageToken ? [...prev, ...(d.messages ?? [])] : (d.messages ?? []))
      setNextPageToken(d.nextPageToken)
    } finally {
      setMsgLoading(false)
    }
  }, [])

  useEffect(() => { void fetchStatus() }, [fetchStatus])
  useEffect(() => {
    if (status?.connected && canRead) void fetchMessages()
  }, [status?.connected, canRead, fetchMessages])

  async function disconnect() {
    if (!confirm('Gmail bağlantısını kesmek istediğinizden emin misiniz?')) return
    setDisconnecting(true)
    try {
      await authFetch('/api/admin/gmail/disconnect', { method: 'POST' })
      setStatus({ connected: false })
      setMessages([])
      setSelectedId(null)
    } finally {
      setDisconnecting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const connectedBadge = status?.connected && (
    <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-1.5">
      <span className="h-2 w-2 rounded-full bg-emerald-500" />
      <span className="text-xs text-[rgb(var(--color-muted))]">{status.accountEmail}</span>
      {canManage && (
        <button
          onClick={disconnect}
          disabled={disconnecting}
          className="ml-1 text-[rgb(var(--color-muted))] hover:text-red-400"
          title="Bağlantıyı kes"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )

  return (
    <div className="flex h-screen flex-col">
      <CMSHeader
        title="Gelen Kutusu"
        subtitle="bilgi@nahaber.com — Haber merkezi e-posta"
        actions={
          <>
            {connectedBadge}
            {status?.connected && (
              <button
                type="button"
                onClick={() => fetchMessages()}
                disabled={msgLoading}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
              >
                <RefreshCw className={cn('h-4 w-4', msgLoading && 'animate-spin')} />
              </button>
            )}
          </>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {statusLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <RefreshCw className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" />
          </div>
        ) : envMissing ? (
          <WrongEnvState />
        ) : !status?.connected ? (
          <NotConnectedState canManage={canManage} />
        ) : (
          <>
            {/* Message list */}
            <div className={cn(
              'flex flex-col border-r border-[rgb(var(--color-border))]',
              selectedId ? 'hidden md:flex md:w-80 lg:w-96' : 'flex-1 md:flex-none md:w-80 lg:w-96',
            )}>
              {/* Header */}
              <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-4 py-3">
                <Inbox className="h-4 w-4 text-[rgb(var(--color-muted))]" />
                <span className="text-sm font-semibold text-[rgb(var(--color-text))]">Gelen Kutusu</span>
                <span className="ml-auto text-xs text-[rgb(var(--color-muted))]">{messages.length} mesaj</span>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto">
                {msgLoading && messages.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-12 text-center">
                    <WifiOff className="mx-auto h-8 w-8 text-[rgb(var(--color-muted))]" />
                    <p className="mt-3 text-sm text-[rgb(var(--color-muted))]">Mesaj bulunamadı</p>
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <MessageRow
                        key={msg.id}
                        msg={msg}
                        selected={msg.id === selectedId}
                        onClick={() => setSelectedId(msg.id)}
                      />
                    ))}
                    {nextPageToken && (
                      <button
                        type="button"
                        onClick={() => fetchMessages(nextPageToken)}
                        disabled={msgLoading}
                        className="w-full py-3 text-center text-xs text-[rgb(var(--color-brand))] hover:underline disabled:opacity-50"
                      >
                        {msgLoading ? 'Yükleniyor…' : 'Daha fazla yükle'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Detail panel */}
            <div className={cn(
              'flex-1 overflow-hidden',
              !selectedId && 'hidden md:flex md:items-center md:justify-center',
            )}>
              {selectedId ? (
                <MessageDetail
                  key={selectedId}
                  messageId={selectedId}
                  canCreate={canCreate}
                  onClose={() => setSelectedId(null)}
                />
              ) : (
                <div className="text-center">
                  <Mail className="mx-auto h-10 w-10 text-[rgb(var(--color-muted))]" />
                  <p className="mt-3 text-sm text-[rgb(var(--color-muted))]">
                    Okumak için bir mesaj seçin
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
