'use client'

/**
 * «Sosyal hesaplarım» / «Hesaplar» — every user's account list on top of
 * /api/social/*. Connection, publish permission and automation are shown as
 * three separate states. Connecting always goes through the platform's own
 * OAuth screen; NaHaber never asks for a password or token.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Link2, Loader2, PauseCircle, PlayCircle, RefreshCw, Stethoscope } from 'lucide-react'
import toast from 'react-hot-toast'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { cn } from '@/lib/utils'
import { RESULT_MESSAGES, accountFormatsLabel } from '@/components/admin/social/SocialAccountsPanel'
import { TARGET_BLOCKER_TEXT } from '@/lib/social/accounts/capabilities'
import { PLATFORM_LABEL, ownerLabel, socialApi, type SocialAccountRow, type SocialMe } from './socialClient'

type OwnerChoice = { key: string; label: string; ownership: Record<string, string> & { kind: string } }
type RuleLite = { id: string; accountId: string; enabled: boolean }
type PageRow = { id: string; name: string; eligible: boolean }

const provinceName = (slug: string | null | undefined) => TURKISH_PROVINCES.find((p) => p.slug === slug)?.name ?? slug ?? ''

function expiryText(a: SocialAccountRow): string {
  if (a.connectionMethod === 'legacy') return 'Eski (legacy) bağlantı'
  if (a.tokenExpiresAt === null) return a.tokenExpiryVerified ? 'Süresiz erişim' : 'Erişim süresi bilinmiyor'
  const ms = a.tokenExpiresAt - Date.now()
  if (ms <= 0) return 'Erişim süresi dolmuş'
  const days = Math.floor(ms / 86_400_000)
  return days >= 1 ? `Erişim ${days} gün geçerli (otomatik yenilenir)` : 'Erişim bir günden az kaldı'
}

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'muted'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
        tone === 'ok' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
        tone === 'warn' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
        tone === 'bad' && 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
        tone === 'muted' && 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))]',
      )}
    >
      {children}
    </span>
  )
}

export function SocialAccountsManager({
  mode = 'self',
  ownerFilter,
}: {
  /** self = profile / publisher pages; admin = central / il panel. */
  mode?: 'self' | 'admin'
  ownerFilter?: (a: SocialAccountRow) => boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const resultCode = searchParams.get('social')
  const fbSelect = searchParams.get('fbSelect')

  const [me, setMe] = useState<SocialMe | null>(null)
  const [accounts, setAccounts] = useState<SocialAccountRow[]>([])
  const [rules, setRules] = useState<RuleLite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [platform, setPlatform] = useState<'instagram' | 'facebook' | 'threads'>('instagram')
  const [ownerKey, setOwnerKey] = useState('')
  const [citySlug, setCitySlug] = useState('')
  const [pages, setPages] = useState<PageRow[]>([])
  const [pagesNext, setPagesNext] = useState<number | null>(null)
  const [pagesError, setPagesError] = useState<string | null>(null)
  const [selectedPage, setSelectedPage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [m, a, r] = await Promise.all([
      socialApi<SocialMe>('/api/social/me'),
      socialApi<{ accounts: SocialAccountRow[] }>('/api/social/accounts'),
      socialApi<{ rules: RuleLite[] }>('/api/social/rules'),
    ])
    if (!m.ok) setError(m.status === 401 ? 'Sosyal hesaplar için giriş yapın.' : m.error)
    else setMe(m.data)
    if (a.ok) setAccounts(a.data.accounts)
    if (r.ok) setRules(r.data.rules ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const ownerChoices = useMemo<OwnerChoice[]>(() => {
    if (!me) return []
    const out: OwnerChoice[] = []
    if (mode === 'self') out.push({ key: 'user', label: 'Kişisel hesabım', ownership: { kind: 'user' } })
    for (const p of me.publishers.filter((x) => x.canManage)) {
      out.push({ key: `publisher:${p.id}`, label: `Yayıncı: ${p.name}`, ownership: { kind: 'publisher', publisherId: p.id } })
    }
    if (mode === 'admin') {
      if (me.central) out.push({ key: 'central', label: 'NaHaber merkez hesabı', ownership: { kind: 'central' } })
      if (me.central || me.provinces.length > 0) out.push({ key: 'province', label: 'İl hesabı', ownership: { kind: 'province' } })
    }
    return out
  }, [me, mode])

  useEffect(() => {
    if (!ownerKey && ownerChoices.length) {
      const wanted = searchParams.get('owner')
      setOwnerKey(ownerChoices.find((c) => c.key === wanted)?.key ?? ownerChoices[0].key)
    }
  }, [ownerChoices, ownerKey, searchParams])

  const provinceChoices = useMemo(
    () => (me?.central ? TURKISH_PROVINCES : TURKISH_PROVINCES.filter((p) => me?.provinces.includes(p.slug))),
    [me],
  )

  const clearQuery = useCallback(() => {
    const q = new URLSearchParams(searchParams.toString())
    for (const k of ['social', 'fbSelect', 'account']) q.delete(k)
    const s = q.toString()
    router.replace(s ? `${pathname}?${s}` : pathname)
  }, [pathname, router, searchParams])

  const loadPages = useCallback(
    async (offset: number) => {
      if (!fbSelect) return
      setPagesError(null)
      const r = await socialApi<{ pages: PageRow[]; nextOffset: number | null }>(`/api/social/facebook-pages?session=${encodeURIComponent(fbSelect)}&offset=${offset}`)
      if (!r.ok) {
        setPagesError(RESULT_MESSAGES[r.code ?? '']?.text ?? 'Sayfa seçimi oturumu geçersiz veya süresi dolmuş. Bağlantıyı yeniden başlatın.')
        return
      }
      setPages((prev) => (offset === 0 ? r.data.pages : [...prev, ...r.data.pages]))
      setPagesNext(r.data.nextOffset ?? null)
    },
    [fbSelect],
  )

  useEffect(() => {
    if (fbSelect) void loadPages(0)
  }, [fbSelect, loadPages])

  const go = async (path: string, body: unknown) => {
    const r = await socialApi<{ authorizeUrl: string }>(path, { method: 'POST', body: JSON.stringify(body) })
    if (!r.ok) {
      toast.error(RESULT_MESSAGES[r.code ?? '']?.text ?? (r.code === 'not_configured' ? 'Bu platform için bağlantı henüz yapılandırılmadı.' : 'Bağlantı başlatılamadı.'))
      return
    }
    // The platform's own login / consent screen. NaHaber never sees the password.
    window.location.assign(r.data.authorizeUrl)
  }

  const startConnect = async () => {
    const choice = ownerChoices.find((c) => c.key === ownerKey)
    if (!choice) return
    const ownership = choice.ownership.kind === 'province' ? { kind: 'province', citySlug } : choice.ownership
    if (ownership.kind === 'province' && !citySlug) return
    setBusy('connect')
    try {
      await go('/api/social/accounts/connect', { platform, ownership })
    } finally {
      setBusy(null)
    }
  }

  const reconnect = async (a: SocialAccountRow) => {
    setBusy(`re:${a.id}`)
    try {
      await go(`/api/social/accounts/${encodeURIComponent(a.id)}/reconnect`, {})
    } finally {
      setBusy(null)
    }
  }

  const setStatus = async (a: SocialAccountRow, action: 'pause' | 'activate') => {
    setBusy(`st:${a.id}`)
    const r = await socialApi<{ status: string }>(`/api/social/accounts/${encodeURIComponent(a.id)}`, { method: 'PATCH', body: JSON.stringify({ action }) })
    setBusy(null)
    if (!r.ok) {
      toast.error(
        r.code === 'reconnect_required' || r.code === 'token_expired'
          ? 'Hesap etkinleştirilemedi: önce platform girişiyle yeniden bağlayın.'
          : r.code && r.code in TARGET_BLOCKER_TEXT
            ? `Hesap etkinleştirilemedi: ${TARGET_BLOCKER_TEXT[r.code as keyof typeof TARGET_BLOCKER_TEXT]}.`
            : 'Durum değiştirilemedi.',
      )
      return
    }
    toast.success(action === 'pause' ? 'Hesap duraklatıldı (yayın ve otomasyon durur).' : 'Hesap etkinleştirildi.')
    void load()
  }

  const checkConnection = async (a: SocialAccountRow) => {
    setBusy(`ck:${a.id}`)
    const r = await socialApi<{ state: string; message: string }>(`/api/social/accounts/${encodeURIComponent(a.id)}/check`, { method: 'POST', body: '{}' })
    setBusy(null)
    if (!r.ok) {
      toast.error('Bağlantı kontrol edilemedi.')
      return
    }
    if (r.data.state === 'ok') toast.success(r.data.message)
    else toast.error(r.data.message, { duration: 10000 })
    void load()
  }

  const confirmPage = async () => {
    if (!fbSelect || !selectedPage) return
    setBusy('select')
    const r = await socialApi<{ status: string }>('/api/social/facebook-pages', { method: 'POST', body: JSON.stringify({ session: fbSelect, pageId: selectedPage }) })
    setBusy(null)
    if (!r.ok) {
      toast.error(RESULT_MESSAGES[r.code ?? '']?.text ?? 'Sayfa bağlanamadı.')
      return
    }
    toast.success(r.data.status === 'active' ? 'Facebook sayfası bağlandı.' : RESULT_MESSAGES.connected_needs_attention.text)
    clearQuery()
    void load()
  }

  const shown = useMemo(() => (ownerFilter ? accounts.filter(ownerFilter) : accounts), [accounts, ownerFilter])
  const enabledRulesBy = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rules) if (r.enabled) m.set(r.accountId, (m.get(r.accountId) ?? 0) + 1)
    return m
  }, [rules])
  const readyPlatforms = useMemo(() => Object.entries(me?.platforms ?? {}).filter(([, v]) => v.ready).map(([k]) => k), [me])
  const banner = resultCode ? RESULT_MESSAGES[resultCode] : null
  const ownerChoice = ownerChoices.find((c) => c.key === ownerKey)

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-[rgb(var(--color-muted))]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Hesaplar yükleniyor…
      </p>
    )
  }
  if (error) return <p className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>

  return (
    <div className="space-y-4">
      {banner && (
        <div role="status" className={cn('flex items-start gap-2 rounded-lg px-3 py-2 text-sm', banner.ok ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100')}>
          {banner.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          <span className="flex-1">{banner.text}</span>
          {!fbSelect && (
            <button type="button" onClick={clearQuery} className="text-xs underline">
              Kapat
            </button>
          )}
        </div>
      )}

      {fbSelect && (
        <div className="space-y-3 rounded-xl border border-blue-300 p-4 dark:border-blue-800" aria-label="Facebook sayfası seçimi">
          <h3 className="text-sm font-bold">Bağlanacak Facebook sayfasını seçin</h3>
          {pagesError ? (
            <p className="text-sm text-red-700 dark:text-red-300">{pagesError}</p>
          ) : (
            <>
              <ul className="max-h-72 space-y-1 overflow-auto">
                {pages.map((pg) => (
                  <li key={pg.id}>
                    <label className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm', pg.eligible ? 'cursor-pointer hover:bg-[rgb(var(--color-surface))]' : 'opacity-60')}>
                      <input type="radio" name="fb-page" value={pg.id} disabled={!pg.eligible} checked={selectedPage === pg.id} onChange={() => setSelectedPage(pg.id)} />
                      <span>{pg.name}</span>
                      {!pg.eligible && <span className="text-xs text-[rgb(var(--color-muted))]">(içerik oluşturma yetkiniz yok)</span>}
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                {pagesNext !== null && (
                  <button type="button" className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm" onClick={() => void loadPages(pagesNext)}>
                    Daha fazla sayfa
                  </button>
                )}
                <button type="button" disabled={!selectedPage || busy === 'select'} onClick={() => void confirmPage()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                  {busy === 'select' ? 'Bağlanıyor…' : 'Bu sayfayı bağla'}
                </button>
              </div>
            </>
          )}
          <button type="button" onClick={clearQuery} className="text-xs text-[rgb(var(--color-muted))] underline">
            Vazgeç
          </button>
        </div>
      )}

      {ownerChoices.length > 0 && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-[rgb(var(--color-border))] p-3"
          onSubmit={(e) => {
            e.preventDefault()
            void startConnect()
          }}
        >
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Platform</span>
            <select value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)} className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5">
              {(['instagram', 'facebook', 'threads'] as const).map((p) => (
                <option key={p} value={p} disabled={!readyPlatforms.includes(p)}>
                  {PLATFORM_LABEL[p]}
                  {readyPlatforms.includes(p) ? '' : ' — henüz açık değil'}
                </option>
              ))}
            </select>
          </label>
          {ownerChoices.length > 1 && (
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Hesap kimin adına</span>
              <select value={ownerKey} onChange={(e) => setOwnerKey(e.target.value)} className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5">
                {ownerChoices.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {ownerChoice?.ownership.kind === 'province' && (
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">İl</span>
              <select value={citySlug} onChange={(e) => setCitySlug(e.target.value)} required className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5">
                <option value="">İl seçin</option>
                {provinceChoices.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="submit"
            disabled={busy === 'connect' || !readyPlatforms.includes(platform) || (ownerChoice?.ownership.kind === 'province' && !citySlug)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Link2 className="h-4 w-4" aria-hidden /> Platformda giriş yap ve bağla
          </button>
          <p className="w-full text-xs text-[rgb(var(--color-muted))]">
            Giriş ve izin {PLATFORM_LABEL[platform]}’ın kendi ekranında yapılır. NaHaber şifrenizi görmez; erişim anahtarı sunucuda şifreli saklanır ve size gösterilmez.
          </p>
        </form>
      )}

      {shown.length === 0 ? (
        <p className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-6 text-center text-sm text-[rgb(var(--color-muted))]">Henüz bağlı hesap yok.</p>
      ) : (
        <ul className="divide-y divide-[rgb(var(--color-border))]" aria-label="Sosyal hesaplar">
          {shown.map((a) => {
            const blocker = a.health.publishBlocker
            const autoCount = enabledRulesBy.get(a.id) ?? 0
            return (
              <li key={a.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[rgb(var(--color-text))]">
                      {a.displayName}
                      {a.username && <span className="ml-1 font-normal text-[rgb(var(--color-muted))]">@{a.username}</span>}
                    </p>
                    <p className="text-xs text-[rgb(var(--color-muted))]">
                      {PLATFORM_LABEL[a.platform]} · {a.ownerKind === 'province' ? `İl: ${provinceName(a.ownership.citySlug)}` : ownerLabel(a, me?.publishers ? Object.fromEntries(me.publishers.map((p) => [p.id, p.name])) : {})} · {accountFormatsLabel(a)}
                    </p>
                  </div>
                  {a.canManage && (
                    <div className="flex flex-wrap gap-1.5">
                      {a.connectionMethod !== 'legacy' && (
                        <button type="button" disabled={busy === `ck:${a.id}`} onClick={() => void checkConnection(a)} className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 text-xs" title="Platforma yalnızca okuma isteği gönderir; paylaşım yapmaz">
                          <Stethoscope className="h-3.5 w-3.5" aria-hidden /> {busy === `ck:${a.id}` ? 'Kontrol ediliyor…' : 'Bağlantıyı kontrol et'}
                        </button>
                      )}
                      {a.connectionMethod !== 'legacy' && (
                        <button type="button" disabled={busy === `re:${a.id}`} onClick={() => void reconnect(a)} className={cn('inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs', a.status === 'needs_reauth' ? 'bg-blue-600 font-semibold text-white' : 'border border-[rgb(var(--color-border))]')}>
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Platform girişiyle yeniden bağla
                        </button>
                      )}
                      {a.status === 'active' ? (
                        <button type="button" disabled={busy === `st:${a.id}`} onClick={() => void setStatus(a, 'pause')} className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 text-xs">
                          <PauseCircle className="h-3.5 w-3.5" aria-hidden /> Hesabı duraklat
                        </button>
                      ) : a.status === 'paused' ? (
                        <button type="button" disabled={busy === `st:${a.id}`} onClick={() => void setStatus(a, 'activate')} className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 text-xs">
                          <PlayCircle className="h-3.5 w-3.5" aria-hidden /> Etkinleştir
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5" aria-label="Durumlar">
                  <Pill tone={a.status === 'active' ? 'ok' : a.status === 'needs_reauth' ? 'bad' : 'warn'}>
                    Bağlantı: {a.status === 'active' ? 'etkin' : a.status === 'paused' ? 'duraklatıldı' : a.status === 'needs_reauth' ? 'yeniden bağlanmalı' : 'devre dışı'}
                  </Pill>
                  <Pill tone={blocker ? (blocker === 'publish_permission_unverified' ? 'warn' : 'bad') : 'ok'}>
                    Yayın izni: {blocker ? TARGET_BLOCKER_TEXT[blocker] : 'hazır'}
                  </Pill>
                  <Pill tone={autoCount > 0 ? 'ok' : 'muted'}>Otomasyon: {autoCount > 0 ? `${autoCount} kural açık` : 'kapalı'}</Pill>
                  {!a.canPublish && <Pill tone="muted">Yalnızca görüntüleme</Pill>}
                </div>
                {a.status === 'needs_reauth' && a.statusReason && <p className="text-xs font-semibold text-red-700 dark:text-red-300">{a.statusReason}</p>}
                <p className={cn('text-xs', a.health.tokenWarning || a.tokenWarning ? 'text-amber-700 dark:text-amber-300' : 'text-[rgb(var(--color-muted))]')}>
                  {expiryText(a)}
                  {a.tokenWarning ? ` · ${a.tokenWarning}` : ''}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
