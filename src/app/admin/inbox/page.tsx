'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Mail, Shield, RefreshCw, Inbox, FileText, AlertCircle,
  WifiOff, LogOut, ChevronRight, Send, Reply, X, PenSquare,
} from 'lucide-react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { cn } from '@/lib/utils'
import type { GmailMessageSummary, GmailMessageDetail } from '@/lib/gmail/types'
import { auth } from '@/lib/firebase/auth'

async function getToken(): Promise<string> {
  return (await auth.currentUser?.getIdToken()) ?? ''
}
async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await getToken()
  return fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  })
}

// ── Types ──────────────────────────────────────────────────────────────────

interface StatusData {
  connected: boolean
  accountEmail?: string
  connectedAt?: number
  connectedBy?: string
  misconfigured?: boolean
  messagesUnread?: number
  messagesTotal?: number
}

interface ComposeData {
  to: string
  subject: string
  body: string
  replyToMessageId?: string
  isReply?: boolean
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
  } catch { return dateStr }
}

function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return match ? match[1] : from
}

function extractName(from: string): string {
  return from.replace(/<[^>]+>/, '').trim() || from
}

// ── Compose Modal ─────────────────────────────────────────────────────────

function ComposeModal({
  initial,
  fromEmail,
  onClose,
  onSent,
}: {
  initial: ComposeData
  fromEmail: string
  onClose: () => void
  onSent: () => void
}) {
  const [to, setTo] = useState(initial.to)
  const [subject, setSubject] = useState(initial.subject)
  const [body, setBody] = useState(initial.body)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function handleSend() {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      setError('Alıcı, konu ve mesaj alanları zorunludur.')
      return
    }
    setSending(true)
    setError('')
    try {
      const r = await authFetch('/api/admin/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim(),
          body: body.trim(),
          replyToMessageId: initial.replyToMessageId,
        }),
      })
      const d = await r.json() as { ok?: boolean; error?: string; message?: string }
      if (!r.ok || d.error) throw new Error(d.message ?? d.error ?? 'Gönderilemedi')
      onSent()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gönderme hatası')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:items-center sm:justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 flex w-full max-w-xl flex-col rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-4 py-3">
          <PenSquare className="h-4 w-4 text-[rgb(var(--color-brand))]" />
          <span className="text-sm font-semibold text-[rgb(var(--color-text))]">
            {initial.isReply ? 'Yanıtla' : 'Yeni Mesaj'}
          </span>
          <span className="ml-auto text-xs text-[rgb(var(--color-muted))]">{fromEmail}</span>
          <button onClick={onClose} className="ml-2 text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-0 divide-y divide-[rgb(var(--color-border))]">
          <div className="flex items-center gap-2 px-4 py-2">
            <span className="w-10 shrink-0 text-xs text-[rgb(var(--color-muted))]">Kime</span>
            <input
              type="email"
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder="ornek@domain.com"
              className="flex-1 bg-transparent text-sm text-[rgb(var(--color-text))] outline-none placeholder:text-[rgb(var(--color-muted))]"
            />
          </div>
          <div className="flex items-center gap-2 px-4 py-2">
            <span className="w-10 shrink-0 text-xs text-[rgb(var(--color-muted))]">Konu</span>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Konu"
              className="flex-1 bg-transparent text-sm text-[rgb(var(--color-text))] outline-none placeholder:text-[rgb(var(--color-muted))]"
            />
          </div>
        </div>

        {/* Body */}
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Mesajınızı buraya yazın…"
          rows={10}
          className="flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-relaxed text-[rgb(var(--color-text))] outline-none placeholder:text-[rgb(var(--color-muted))]"
        />

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-[rgb(var(--color-border))] px-4 py-3">
          {error && <p className="flex-1 text-xs text-red-400">{error}</p>}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-sm text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="flex items-center gap-2 rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Gönderiliyor…' : 'Gönder'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Not Connected ────────────────────────────────────────────────────────────

function NotConnectedState({ canManage }: { canManage: boolean }) {
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

  async function handleConnect() {
    setConnecting(true)
    setConnectError('')
    try {
      const r = await authFetch('/api/admin/gmail/connect')
      const d = await r.json() as { error?: string; authUrl?: string }
      if (!r.ok || d.error) throw new Error(d.error ?? 'Bağlantı başlatılamadı')
      window.location.href = d.authUrl!
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
          Haber odası gelen kutusu,{' '}
          <strong className="text-[rgb(var(--color-text))]">bilgi@nahaber.com</strong>{' '}
          hesabını Google OAuth ile güvenli şekilde bağladıktan sonra burada görünecek.
        </p>
        <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <Shield className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Yalnızca bilgi@nahaber.com hesabı kabul edilir.</p>
          </div>
        </div>
        {connectError && <p className="mt-3 text-sm text-red-400">{connectError}</p>}
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

// ── Message Row ──────────────────────────────────────────────────────────────

function MessageRow({ msg, selected, onClick }: {
  msg: GmailMessageSummary; selected: boolean; onClick: () => void
}) {
  const isUnread = msg.unread
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
        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', isUnread ? 'bg-[rgb(var(--color-brand))]' : 'opacity-0')} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={cn('truncate text-sm', isUnread ? 'font-semibold text-[rgb(var(--color-text))]' : 'text-[rgb(var(--color-muted))]')}>
              {extractName(msg.from)}
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

// ── Message Detail ───────────────────────────────────────────────────────────

function MessageDetail({
  messageId, canCreate, fromEmail, onClose, onMarkRead, onReply,
}: {
  messageId: string
  canCreate: boolean
  fromEmail: string
  onClose: () => void
  onMarkRead: (id: string) => void
  onReply: (data: ComposeData) => void
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
      .then(r => r.json())
      .then((d: GmailMessageDetail & { error?: string }) => {
        if (d.error) throw new Error(d.error)
        setMsg(d)
        // Auto-mark as read (fire-and-forget)
        if (d.unread) {
          void authFetch(`/api/admin/gmail/messages/${messageId}/mark-read`, { method: 'POST' })
            .then(() => onMarkRead(messageId))
            .catch(() => { /* non-fatal */ })
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Yüklenemedi'))
      .finally(() => setLoading(false))
  }, [messageId, onMarkRead])

  async function convertToDraft() {
    if (!canCreate || converting) return
    setConverting(true)
    try {
      const r = await authFetch(`/api/admin/gmail/messages/${messageId}/to-draft`, { method: 'POST' })
      const d = await r.json() as { draftId?: string; error?: string }
      if (d.error) throw new Error(d.error)
      setDraftId(d.draftId ?? 'ok')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dönüştürme başarısız')
    } finally {
      setConverting(false)
    }
  }

  function handleReply() {
    if (!msg) return
    onReply({
      to: extractEmail(msg.from),
      subject: msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`,
      body: `\n\n---\n${formatDate(msg.date)} tarihinde ${msg.from} yazdı:\n${msg.body.split('\n').map(l => `> ${l}`).join('\n')}`,
      replyToMessageId: messageId,
      isReply: true,
    })
  }

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <RefreshCw className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" />
    </div>
  )
  if (error) return (
    <div className="p-6">
      <p className="text-sm text-red-400">{error}</p>
      <button onClick={onClose} className="mt-3 text-sm text-[rgb(var(--color-brand))] hover:underline">← Geri</button>
    </div>
  )
  if (!msg) return null

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-[rgb(var(--color-border))] px-4 py-3">
        <button onClick={onClose} className="mb-2 text-xs text-[rgb(var(--color-brand))] hover:underline">← Geri</button>
        <h2 className="text-base font-bold text-[rgb(var(--color-text))]">{msg.subject}</h2>
        <p className="mt-0.5 text-xs text-[rgb(var(--color-muted))]">
          {msg.from} · {formatDate(msg.date)}
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {msg.htmlBody ? (
          <iframe
            srcDoc={msg.htmlBody}
            sandbox="allow-same-origin"
            className="h-full min-h-[300px] w-full border-0"
            title="E-posta içeriği"
          />
        ) : (
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-[rgb(var(--color-text))]">
            {msg.body || '(içerik yok)'}
          </pre>
        )}
      </div>

      {/* Footer actions */}
      <div className="shrink-0 border-t border-[rgb(var(--color-border))] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Reply */}
          <button
            type="button"
            onClick={handleReply}
            className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]"
          >
            <Reply className="h-4 w-4" />
            Yanıtla
          </button>

          {/* Convert to draft */}
          {canCreate && (
            draftId ? (
              <div className="flex items-center gap-2 text-sm text-emerald-500">
                <FileText className="h-4 w-4" />
                <span>Taslak oluşturuldu</span>
                <a href="/admin/news?filter=pending" className="font-semibold underline">Görüntüle</a>
              </div>
            ) : (
              <button
                type="button"
                onClick={convertToDraft}
                disabled={converting}
                className="flex items-center gap-1.5 rounded-lg bg-[rgb(var(--color-brand))] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {converting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Habere Dönüştür
              </button>
            )
          )}
        </div>
      </div>
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
  const [msgError, setMsgError] = useState('')
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [envMissing, setEnvMissing] = useState(false)
  const [callbackError, setCallbackError] = useState('')
  const [compose, setCompose] = useState<ComposeData | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    window.history.replaceState({}, '', '/admin/inbox')
    const ERRORS: Record<string, string> = {
      missing_scope: 'Gmail okuma/gönderme izni verilmedi. Lütfen tekrar bağlanın.',
      no_refresh_token: 'Google yenileme token\'ı döndürmedi. Tekrar deneyin.',
      wrong_account: 'Yanlış Google hesabı seçildi.',
      invalid_state: 'Bağlantı isteği süresi doldu.',
      access_denied: 'Google erişimi reddedildi.',
      callback_error: 'OAuth tamamlanırken hata oluştu.',
    }
    const err = params.get('error')
    if (err) setCallbackError(ERRORS[err] ?? `OAuth hatası: ${err}`)
  }, [])

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const r = await authFetch('/api/admin/gmail/status')
      const d = await r.json() as StatusData & { misconfigured?: boolean }
      if (d.misconfigured || r.status >= 500) { setEnvMissing(true); return }
      setStatus(d)
    } catch {
      setEnvMissing(true)
    } finally {
      setStatusLoading(false)
    }
  }, [])

  const fetchMessages = useCallback(async (pageToken?: string) => {
    setMsgLoading(true)
    if (!pageToken) setMsgError('')
    try {
      const url = `/api/admin/gmail/messages?maxResults=25${pageToken ? `&pageToken=${pageToken}` : ''}`
      const r = await authFetch(url)
      const d = await r.json() as { messages?: GmailMessageSummary[]; nextPageToken?: string; error?: string; message?: string }
      if (d.error) {
        setMsgError(d.message ?? `Gmail hatası: ${d.error}`)
        return
      }
      setMessages(prev => pageToken ? [...prev, ...(d.messages ?? [])] : (d.messages ?? []))
      setNextPageToken(d.nextPageToken)
    } catch {
      setMsgError('Mesajlar yüklenemedi.')
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

  // When a message is opened and marked read, update local state
  const handleMarkRead = useCallback((id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, unread: false, labelIds: m.labelIds.filter(l => l !== 'UNREAD') } : m))
  }, [])

  function openCompose() {
    setCompose({ to: '', subject: '', body: '' })
  }

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
        title="Mail Kutusu"
        subtitle="bilgi@nahaber.com — Haber merkezi e-posta"
        actions={
          <>
            {connectedBadge}
            {status?.connected && (
              <>
                <button
                  type="button"
                  onClick={openCompose}
                  className="flex items-center gap-1.5 rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  <PenSquare className="h-4 w-4" />
                  Yeni Mesaj
                </button>
                <button
                  type="button"
                  onClick={() => fetchMessages()}
                  disabled={msgLoading}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
                >
                  <RefreshCw className={cn('h-4 w-4', msgLoading && 'animate-spin')} />
                </button>
              </>
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
          <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
            <div className="rounded-[14px] border border-red-500/20 bg-red-500/[0.05] p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                <div>
                  <p className="text-sm font-semibold text-[rgb(var(--color-text))]">Yapılandırma eksik</p>
                  <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
                    GMAIL_CLIENT_ID veya şifreleme anahtarı ayarlanmamış.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : !status?.connected ? (
          <>
            {callbackError && (
              <div className="absolute left-1/2 top-20 z-10 w-full max-w-lg -translate-x-1/2 px-4">
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {callbackError}
                </div>
              </div>
            )}
            <NotConnectedState canManage={canManage} />
          </>
        ) : (
          <>
            {/* Message list */}
            <div className={cn(
              'flex flex-col border-r border-[rgb(var(--color-border))]',
              selectedId ? 'hidden md:flex md:w-80 lg:w-96' : 'flex-1 md:flex-none md:w-80 lg:w-96',
            )}>
              <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-4 py-3">
                <Inbox className="h-4 w-4 text-[rgb(var(--color-muted))]" />
                <span className="text-sm font-semibold text-[rgb(var(--color-text))]">Gelen Kutusu</span>
                <span className="ml-auto text-xs text-[rgb(var(--color-muted))]">{messages.length} mesaj</span>
              </div>

              <div className="flex-1 overflow-y-auto">
                {msgError ? (
                  <div className="px-4 py-12 text-center">
                    <AlertCircle className="mx-auto h-8 w-8 text-amber-400" />
                    <p className="mt-3 text-sm text-amber-400">{msgError}</p>
                    <button
                      onClick={() => fetchMessages()}
                      className="mt-3 text-sm text-[rgb(var(--color-brand))] hover:underline"
                    >
                      Tekrar dene
                    </button>
                  </div>
                ) : msgLoading && messages.length === 0 ? (
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
                    {messages.map(msg => (
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
                  fromEmail={status.accountEmail ?? 'bilgi@nahaber.com'}
                  onClose={() => setSelectedId(null)}
                  onMarkRead={handleMarkRead}
                  onReply={setCompose}
                />
              ) : (
                <div className="text-center">
                  <Mail className="mx-auto h-10 w-10 text-[rgb(var(--color-muted))]" />
                  <p className="mt-3 text-sm text-[rgb(var(--color-muted))]">Okumak için bir mesaj seçin</p>
                  <button
                    type="button"
                    onClick={openCompose}
                    className="mt-4 flex items-center gap-2 mx-auto rounded-lg border border-[rgb(var(--color-border))] px-4 py-2 text-sm text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]"
                  >
                    <PenSquare className="h-4 w-4" />
                    Yeni Mesaj Yaz
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Compose modal */}
      {compose && (
        <ComposeModal
          initial={compose}
          fromEmail={status?.accountEmail ?? 'bilgi@nahaber.com'}
          onClose={() => setCompose(null)}
          onSent={() => { /* optionally refresh sent count */ }}
        />
      )}
    </div>
  )
}
