'use client'

/**
 * Reply box shared by comments and direct messages. Sends only when the editor
 * presses «Gönder»; a request id makes a double click harmless. An AI/template
 * draft is only a starting point — the editor edits and approves it.
 */
import { useMemo, useState } from 'react'
import { Loader2, Send, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { socialApi } from '@/components/social/socialClient'
import { CATEGORY_TR, errorText, type InboxCategory, type ReplySummary } from '@/lib/social/inbox/model'
import { cn } from '@/lib/utils'

export type DraftView = { text: string; source: 'ai' | 'template'; provider: string | null; at: number } | null

const newRequestId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `r${Date.now()}${Math.random().toString(36).slice(2)}`)

const STATUS_TR: Record<ReplySummary['status'], string> = {
  sending: 'gönderiliyor',
  sent: 'gönderildi',
  failed: 'gönderilemedi',
  uncertain: 'sonuç belirsiz',
  pending_publish: 'yayımlanmayı bekliyor (Threads)',
}

export function ReplyStatusLine({ reply }: { reply: ReplySummary | null | undefined }) {
  if (!reply) return null
  const tone = reply.status === 'sent' ? 'text-emerald-700 dark:text-emerald-300' : reply.status === 'failed' || reply.status === 'uncertain' ? 'text-red-700 dark:text-red-300' : 'text-amber-700'
  return (
    <p className={cn('text-xs', tone)}>
      Cevap {STATUS_TR[reply.status]}
      {reply.source === 'auto' ? ' · otomatik' : reply.source === 'ai_draft' ? ' · AI taslağından' : ''} · {new Date(reply.at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
      {reply.errorCode && reply.status !== 'sent' ? ` — ${errorText(reply.status === 'uncertain' ? 'uncertain' : reply.errorCode)}` : ''}
      <span className="block whitespace-pre-wrap text-[rgb(var(--color-muted))]">“{reply.text}”</span>
    </p>
  )
}

export function ReplyComposer(props: {
  endpoint: string
  itemId: string
  maxLength: number
  draft: DraftView
  category: InboxCategory | null | undefined
  autoBlockText: string | null
  reply: ReplySummary | null | undefined
  disabledReason?: string | null
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(props.draft?.text ?? '')
  const [fromDraft, setFromDraft] = useState(!!props.draft)
  const [busy, setBusy] = useState<null | 'send' | 'draft' | 'ack'>(null)
  const requestId = useMemo(newRequestId, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const uncertain = props.reply?.status === 'uncertain'

  const draft = async () => {
    setBusy('draft')
    const r = await socialApi<{ draft: DraftView; reason: string }>(props.endpoint, { method: 'POST', body: JSON.stringify({ action: 'draft', id: props.itemId }) })
    setBusy(null)
    if (!r.ok) return toast.error('Taslak hazırlanamadı.')
    if (r.data.draft) {
      setText(r.data.draft.text)
      setFromDraft(true)
      setOpen(true)
      if (r.data.draft.source === 'template') toast(r.data.reason === 'ai_off' ? 'AI kapalı — hazır kalıp kullanıldı.' : 'Hazır kalıp kullanıldı.')
    } else toast(r.data.reason === 'ai_off' ? 'AI kapalı ve bu tür için hazır kalıp yok — cevabı siz yazın.' : 'Bu metin için güvenli taslak üretilemedi — cevabı siz yazın.')
  }

  const send = async () => {
    setBusy('send')
    const r = await socialApi<{ status: string }>(props.endpoint, { method: 'POST', body: JSON.stringify({ action: 'reply', id: props.itemId, text, requestId, source: fromDraft ? 'ai_draft' : 'editor' }) })
    setBusy(null)
    if (!r.ok) {
      toast.error(r.code === 'uncertain_needs_check' ? 'Önceki cevabın sonucu belirsiz — önce platformda kontrol edin.' : r.code === 'in_flight' ? 'Cevap zaten gönderiliyor.' : errorText(r.code ?? null))
      props.onDone()
      return
    }
    toast.success(r.data.status === 'pending_publish' ? 'Cevap hazırlandı; Threads yayımı en geç 30 dakika içinde tamamlanır.' : 'Cevap gönderildi.')
    setOpen(false)
    setText('')
    props.onDone()
  }

  const ack = async (resolution: 'sent' | 'not_sent') => {
    setBusy('ack')
    const r = await socialApi(props.endpoint, { method: 'POST', body: JSON.stringify({ action: 'ack_uncertain', id: props.itemId, resolution }) })
    setBusy(null)
    if (!r.ok) return toast.error('Kaydedilemedi.')
    props.onDone()
  }

  return (
    <div className="space-y-1.5">
      {props.category ? (
        <p className="text-xs text-[rgb(var(--color-muted))]">
          Tür: <b>{CATEGORY_TR[props.category]}</b>
          {props.autoBlockText ? ` · otomatik cevap yok: ${props.autoBlockText}` : ''}
        </p>
      ) : null}
      <ReplyStatusLine reply={props.reply} />
      {uncertain ? (
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="text-red-700">Platformda cevap görünüyor mu?</span>
          <button type="button" disabled={!!busy} onClick={() => void ack('sent')} className="rounded border px-2 py-0.5">Evet, gönderilmiş</button>
          <button type="button" disabled={!!busy} onClick={() => void ack('not_sent')} className="rounded border px-2 py-0.5">Hayır, gönderilmemiş</button>
        </div>
      ) : null}
      {props.disabledReason ? <p className="text-xs text-amber-700">{props.disabledReason}</p> : null}
      {!open ? (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" disabled={!!props.disabledReason || uncertain} onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 text-xs font-semibold disabled:opacity-50">
            <Send className="h-3.5 w-3.5" /> {props.draft ? 'Taslağı düzenle ve cevapla' : 'Cevapla'}
          </button>
          <button type="button" disabled={!!busy || !!props.disabledReason || uncertain} onClick={() => void draft()} className="inline-flex items-center gap-1 rounded-lg border border-violet-300 px-2 py-1 text-xs font-semibold text-violet-800 disabled:opacity-50 dark:text-violet-200">
            {busy === 'draft' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} AI taslak
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={props.maxLength}
            rows={3}
            className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent p-2 text-sm"
            placeholder="Cevabınız (yalnız nahaber.com bağlantısı eklenebilir)"
          />
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button type="button" disabled={!!busy || !text.trim()} onClick={() => void send()} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1 font-semibold text-white disabled:opacity-50">
              {busy === 'send' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Gönder
            </button>
            <button type="button" disabled={!!busy} onClick={() => void draft()} className="rounded-lg border px-2 py-1">AI taslak</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-2 py-1">Vazgeç</button>
            <span className="text-[rgb(var(--color-muted))]">{text.length}/{props.maxLength}{props.draft?.source === 'ai' && fromDraft ? ' · AI taslağı — göndermeden önce kontrol edin' : ''}</span>
          </div>
        </div>
      )}
    </div>
  )
}
