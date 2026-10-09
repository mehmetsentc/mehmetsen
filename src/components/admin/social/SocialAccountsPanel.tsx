'use client'

/**
 * "Hesaplar" — social account connections (Facebook Pages, Instagram Login, Threads).
 *
 * - Login happens on the platform's own screen; this panel never asks for
 *   passwords, tokens or app secrets.
 * - Shows only server data (public account model + config readiness). No mock rows.
 * - Connecting an account does NOT enable automatic sharing.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Link2, Loader2, PauseCircle, PlayCircle, RefreshCw, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import toast from 'react-hot-toast'
import { auth } from '@/lib/firebase/auth'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { cn } from '@/lib/utils'
import type { SocialAccountPlatform, SocialAccountPublic, SocialAccountStatus } from '@/lib/social/accounts/types'
import { publishableKinds, type ContentKind } from '@/lib/social/accounts/capabilities'

type ConfigStatus = { ready: boolean; missing: string[]; redirectUri: string | null }
type TestEnvStatus = { active: boolean; problems: string[]; mediaProblems?: string[]; publishProblems?: string[]; warnings: string[]; allowedAccountCount: number; connectPlatforms?: string[] }
type AccountsResponse = { accounts: SocialAccountPublic[]; config: Record<SocialAccountPlatform, ConfigStatus>; testEnvironment?: TestEnvStatus }
type PageRow = { id: string; name: string; eligible: boolean }

export const PLATFORM_LABEL: Record<SocialAccountPlatform, string> = {
  facebook: 'Facebook Sayfası',
  instagram: 'Instagram (Instagram Login)',
  threads: 'Threads',
}

const KIND_LABEL: Record<ContentKind, string> = {
  image_post: 'Görselli gönderi',
  carousel_post: 'Kaydırmalı',
  story: 'Hikâye',
  reel: 'Reels',
  video: 'Video',
}

/**
 * Hesap bazında yayımlanabilir biçimler = platform yeteneği ∩ NaHaber adaptörü
 * (sunucudaki publishableKinds ile aynı fonksiyon). Reels/video adaptörde
 * olmadığından hiçbir hesapta listelenmez.
 */
export function accountFormatsLabel(a: Pick<SocialAccountPublic, 'platform' | 'connectionMethod' | 'platformAccountType'>): string {
  const kinds = publishableKinds(a)
  return kinds.length ? kinds.map((k) => KIND_LABEL[k]).join(' · ') : 'Yayımlanabilir biçim yok'
}

const STATUS_LABEL: Record<SocialAccountStatus, string> = {
  active: 'Etkin',
  paused: 'Duraklatıldı',
  needs_reauth: 'Yeniden bağlantı gerekli',
  disabled: 'Devre dışı',
}

/** Callback result codes → Turkish messages (no Meta error text is ever shown). */
export const RESULT_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'Hesap bağlandı.' },
  connected_needs_attention: { ok: false, text: 'Hesap kaydedildi ancak yayın için hazır değil (izin doğrulanamadı veya eksik).' },
  facebook_select: { ok: true, text: 'Facebook girişi tamamlandı — bağlanacak sayfayı seçin.' },
  cancelled: { ok: false, text: 'Platform girişinden vazgeçildi; bağlantı yapılmadı.' },
  state_invalid: { ok: false, text: 'Bağlantı isteği doğrulanamadı. Lütfen yeniden başlatın.' },
  state_expired: { ok: false, text: 'Bağlantı isteğinin süresi doldu. Lütfen yeniden başlatın.' },
  session_required: { ok: false, text: 'NaHaber oturumu bulunamadı. Panele yeniden giriş yapıp tekrar deneyin.' },
  session_mismatch: { ok: false, text: 'Bağlantıyı başlatan kullanıcı ile oturumdaki kullanıcı farklı.' },
  forbidden: { ok: false, text: 'Bu hesabı yönetme yetkiniz yok.' },
  not_configured: { ok: false, text: 'Bu platform için uygulama yapılandırması eksik.' },
  missing_code: { ok: false, text: 'Platform yetkilendirme kodu göndermedi.' },
  permission_declined: { ok: false, text: 'Gerekli yayın izinleri reddedildi. Bağlantı yapılmadı.' },
  permission_missing: { ok: false, text: 'Gerekli yayın izinleri verilmedi. Bağlantı yapılmadı.' },
  permission_unverified: { ok: false, text: 'Yayın izinleri doğrulanamadı; mevcut bağlantı korunarak işlem durduruldu.' },
  no_pages: { ok: false, text: 'Bu Facebook kullanıcısının yönetebildiği sayfa yok.' },
  no_eligible_pages: { ok: false, text: 'İçerik oluşturma yetkiniz olan sayfa bulunamadı.' },
  not_professional: { ok: false, text: 'Instagram hesabı profesyonel (İşletme/İçerik Üretici) değil.' },
  account_mismatch: { ok: false, text: 'Yeniden bağlamada farklı bir hesapla giriş yapıldı. Mevcut bağlantı değişmedi.' },
  owned_elsewhere: { ok: false, text: 'Bu hesap başka bir il/yayıncıya bağlı. Sessizce yeniden atanmadı.' },
  test_account_not_allowed: { ok: false, text: 'Test ortamı: bu hesap izin listesinde değil; kaydedilmedi.' },
  legacy_account_exists: { ok: false, text: 'Bu hesap mevcut (legacy) Onyeditivi bağlantısına ait; değiştirilmedi. Geçiş için hesabın satırındaki “Platform girişiyle yeniden bağla”yı kullanın.' },
  reconnect_target_missing: { ok: false, text: 'Yeniden bağlanacak hesap kaydı bulunamadı.' },
  encryption_unavailable: { ok: false, text: 'Sunucuda şifreleme anahtarı yok; bağlantı kaydedilmedi.' },
  platform_error: { ok: false, text: 'Platformla iletişimde hata oluştu. Mevcut bağlantılar değişmedi.' },
  write_failed: { ok: false, text: 'Kayıt yazılamadı. Mevcut bağlantılar değişmedi.' },
}

async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return fetch(input, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  })
}

function formatExpiry(a: SocialAccountPublic): string {
  if (a.connectionMethod === 'legacy') return 'Legacy kaynak'
  if (a.tokenExpiresAt === null) return a.tokenExpiryVerified ? 'Süresiz (platform doğruladı)' : 'Bilinmiyor'
  const ms = a.tokenExpiresAt - Date.now()
  if (ms <= 0) return 'Süresi dolmuş'
  const days = Math.floor(ms / 86_400_000)
  return days >= 1 ? `${days} gün kaldı` : 'Bir günden az'
}

function PermissionBadge({ a }: { a: SocialAccountPublic }) {
  const map = {
    verified: { icon: ShieldCheck, text: 'Yayın izni doğrulandı', cls: 'text-emerald-700 dark:text-emerald-300' },
    missing: { icon: ShieldAlert, text: 'Yayın izni eksik', cls: 'text-red-700 dark:text-red-300' },
    unverified: { icon: ShieldQuestion, text: 'Yayın izni doğrulanmadı', cls: 'text-amber-700 dark:text-amber-300' },
    legacy: { icon: ShieldQuestion, text: 'Legacy bağlantı (izinler bu panelde doğrulanmaz)', cls: 'text-[rgb(var(--color-muted))]' },
  } as const
  const m = map[a.publishPermission]
  const Icon = m.icon
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', m.cls)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {m.text}
    </span>
  )
}

export function SocialAccountsPanel() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [data, setData] = useState<AccountsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [platform, setPlatform] = useState<SocialAccountPlatform>('facebook')
  const [citySlug, setCitySlug] = useState('')

  const fbSelect = searchParams.get('fbSelect')
  const resultCode = searchParams.get('social')
  const [pages, setPages] = useState<PageRow[]>([])
  const [pagesNext, setPagesNext] = useState<number | null>(null)
  const [pagesError, setPagesError] = useState<string | null>(null)
  const [selectedPage, setSelectedPage] = useState('')

  const clearQuery = useCallback(() => {
    router.replace(`${pathname}?panel=accounts`, { scroll: false })
  }, [router, pathname])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await authedFetch('/api/admin/social/accounts')
      if (res.status === 401 || res.status === 403) {
        setLoadError('Hesapları yönetme yetkiniz yok (merkez yönetici gerekli).')
        setData(null)
        return
      }
      if (!res.ok) throw new Error('load')
      setData((await res.json()) as AccountsResponse)
    } catch {
      setLoadError('Hesaplar yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const loadPages = useCallback(
    async (offset: number) => {
      if (!fbSelect) return
      setPagesError(null)
      const res = await authedFetch(`/api/admin/social/accounts/facebook-pages?session=${encodeURIComponent(fbSelect)}&offset=${offset}`)
      if (!res.ok) {
        setPagesError('Sayfa seçim oturumu geçersiz veya süresi dolmuş. Bağlantıyı yeniden başlatın.')
        return
      }
      const body = (await res.json()) as { pages: PageRow[]; nextOffset: number | null }
      setPages((prev) => (offset === 0 ? body.pages : [...prev, ...body.pages]))
      setPagesNext(body.nextOffset)
    },
    [fbSelect],
  )

  useEffect(() => {
    if (fbSelect) void loadPages(0)
  }, [fbSelect, loadPages])

  const startConnect = async (body: Record<string, unknown>, path = '/api/admin/social/accounts/connect') => {
    setBusy('connect')
    try {
      const res = await authedFetch(path, { method: 'POST', body: JSON.stringify(body) })
      const r = (await res.json()) as { authorizeUrl?: string; code?: string; missing?: string[] }
      if (!res.ok || !r.authorizeUrl) {
        toast.error(r.code === 'not_configured' ? `Yapılandırma eksik: ${(r.missing ?? []).join(', ')}` : RESULT_MESSAGES[r.code ?? '']?.text ?? 'Bağlantı başlatılamadı.')
        return
      }
      window.location.assign(r.authorizeUrl)
    } catch {
      toast.error('Bağlantı başlatılamadı.')
    } finally {
      setBusy(null)
    }
  }

  const changeStatus = async (id: string, action: 'pause' | 'activate') => {
    setBusy(id)
    try {
      const res = await authedFetch(`/api/admin/social/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ action }) })
      const r = (await res.json()) as { code?: string }
      if (!res.ok) {
        const reasons: Record<string, string> = {
          reconnect_required: 'Yeniden bağlantı gerekli.',
          token_expired: 'Erişim anahtarının süresi dolmuş — yeniden bağlayın.',
          publish_permission_missing: 'Yayın izni eksik — yeniden bağlayın.',
          publish_permission_unverified: 'Yayın izni doğrulanmadı — yeniden bağlayın.',
        }
        toast.error(reasons[r.code ?? ''] ?? 'Durum değiştirilemedi.')
        return
      }
      toast.success(action === 'pause' ? 'Hesap duraklatıldı.' : 'Hesap etkinleştirildi.')
      await load()
    } finally {
      setBusy(null)
    }
  }

  const confirmPage = async () => {
    if (!fbSelect || !selectedPage) return
    setBusy('select')
    try {
      const res = await authedFetch('/api/admin/social/accounts/facebook-pages', {
        method: 'POST',
        body: JSON.stringify({ session: fbSelect, pageId: selectedPage }),
      })
      const r = (await res.json()) as { code?: string; status?: string }
      if (!res.ok) {
        toast.error(RESULT_MESSAGES[r.code ?? '']?.text ?? 'Sayfa bağlanamadı.')
        return
      }
      toast.success(r.status === 'active' ? 'Facebook sayfası bağlandı.' : RESULT_MESSAGES.connected_needs_attention.text)
      clearQuery()
      await load()
    } finally {
      setBusy(null)
    }
  }

  const readyPlatforms = useMemo(
    () => (data ? (Object.keys(data.config) as SocialAccountPlatform[]).filter((p) => data.config[p].ready) : []),
    [data],
  )
  const resultBanner = resultCode ? RESULT_MESSAGES[resultCode] : null

  return (
    <section id="smm-accounts" aria-labelledby="smm-accounts-title" className="space-y-4 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="smm-accounts-title" className="text-base font-bold text-[rgb(var(--color-text))]">Hesaplar</h2>
          <p className="mt-1 max-w-3xl text-sm text-[rgb(var(--color-muted))]">
            İl ve yayıncı sosyal medya hesaplarını platformun kendi giriş ekranıyla bağlayın. NaHaber şifre, token veya uygulama sırrı istemez.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm" disabled={loading}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden /> Yenile
        </button>
      </div>

      <p role="note" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
        Hesap bağlamak otomatik paylaşımı açmaz. Bağlanan hesaplar henüz paylaşım hattına dahil değildir; Onyeditivi’nin mevcut paylaşımı aynen devam eder.
      </p>

      {data?.testEnvironment?.active && (
        <div role="note" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-semibold">Test ortamı (preview)</p>
          <p>
            Onyeditivi bağlantısı, X, cron ve otomatik paylaşım kapalı. Bağlantıya açık platformlar:{' '}
            {data.testEnvironment.connectPlatforms?.length ? data.testEnvironment.connectPlatforms.join(', ') : 'yok'}. Yayın yalnızca
            izin listesindeki {data.testEnvironment.allowedAccountCount} hesaba ve yalnızca manuel yapılır.
          </p>
          {data.testEnvironment.problems.length > 0 && (
            <p className="mt-1">Eksik/hatalı yapılandırma (bağlantı ve yayın kapalı): {data.testEnvironment.problems.join(', ')}</p>
          )}
          {(data.testEnvironment.publishProblems?.length ?? 0) > 0 && (
            <p className="mt-1">Yayın kapalı (eksik): {data.testEnvironment.publishProblems!.join(', ')}</p>
          )}
          {(data.testEnvironment.mediaProblems?.length ?? 0) > 0 && (
            <p className="mt-1">Medya yükleme kapalı (eksik): {data.testEnvironment.mediaProblems!.join(', ')}</p>
          )}
          {data.testEnvironment.warnings.length > 0 && (
            <p className="mt-1">Test ortamında tanımlı olmaması önerilenler: {data.testEnvironment.warnings.join(', ')}</p>
          )}
        </div>
      )}

      {resultBanner && resultCode !== 'facebook_select' && (
        <p role="status" className={cn('rounded-lg px-3 py-2 text-sm', resultBanner.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200' : 'bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200')}>
          {resultBanner.text}
        </p>
      )}

      {loading && !data && (
        <p className="flex items-center gap-2 text-sm text-[rgb(var(--color-muted))]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Yükleniyor…</p>
      )}
      {loadError && <p className="text-sm text-red-700 dark:text-red-300">{loadError}</p>}

      {data && (
        <>
          <div className="grid gap-2 sm:grid-cols-3" aria-label="Bağlantı yapılandırması">
            {(Object.keys(PLATFORM_LABEL) as SocialAccountPlatform[]).map((p) => {
              const c = data.config[p]
              return (
                <div key={p} className="rounded-lg border border-[rgb(var(--color-border))] p-3 text-sm">
                  <div className="flex items-center gap-1.5 font-semibold">
                    {c.ready ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> : <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />}
                    {PLATFORM_LABEL[p]}
                  </div>
                  <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
                    {c.ready ? 'Bağlantıya hazır' : `Hazır değil — eksik yapılandırma: ${c.missing.join(', ')}`}
                  </p>
                </div>
              )
            })}
          </div>

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
                      <button type="button" className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm" onClick={() => void loadPages(pagesNext)}>Daha fazla sayfa</button>
                    )}
                    <button type="button" disabled={!selectedPage || busy === 'select'} onClick={() => void confirmPage()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                      {busy === 'select' ? 'Bağlanıyor…' : 'Bu sayfayı bağla'}
                    </button>
                    <button type="button" onClick={clearQuery} className="rounded-lg px-3 py-1.5 text-sm text-[rgb(var(--color-muted))]">Vazgeç</button>
                  </div>
                </>
              )}
            </div>
          )}

          <form
            className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-[rgb(var(--color-border))] p-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!citySlug) return
              void startConnect({ platform, ownership: { citySlug } })
            }}
          >
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Platform</span>
              <select value={platform} onChange={(e) => setPlatform(e.target.value as SocialAccountPlatform)} className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5">
                {(Object.keys(PLATFORM_LABEL) as SocialAccountPlatform[]).map((p) => (
                  <option key={p} value={p} disabled={!readyPlatforms.includes(p)}>
                    {PLATFORM_LABEL[p]}{readyPlatforms.includes(p) ? '' : ' — yapılandırılmadı'}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Sahip il</span>
              <select value={citySlug} onChange={(e) => setCitySlug(e.target.value)} className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5" required>
                <option value="">İl seçin</option>
                {TURKISH_PROVINCES.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
              </select>
            </label>
            <button type="submit" disabled={!citySlug || !readyPlatforms.includes(platform) || busy === 'connect'} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              <Link2 className="h-4 w-4" aria-hidden /> Platformda giriş yap ve bağla
            </button>
          </form>

          {data.accounts.length === 0 ? (
            <p className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-6 text-center text-sm text-[rgb(var(--color-muted))]">Henüz bağlı hesap yok.</p>
          ) : (
            <ul className="divide-y divide-[rgb(var(--color-border))]" aria-label="Bağlı hesaplar">
              {data.accounts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold text-[rgb(var(--color-text))]">
                      {a.displayName}
                      {a.username && <span className="ml-1 font-normal text-[rgb(var(--color-muted))]">@{a.username}</span>}
                    </p>
                    <p className="text-xs text-[rgb(var(--color-muted))]">
                      {PLATFORM_LABEL[a.platform]} · {a.ownership.citySlug ? `İl: ${TURKISH_PROVINCES.find((p) => p.slug === a.ownership.citySlug)?.name ?? a.ownership.citySlug}` : ''}
                      {a.ownership.publisherId ? ` · Yayıncı: ${a.ownership.publisherId}` : ''} · Biçimler: {accountFormatsLabel(a)}
                    </p>
                    {data?.testEnvironment?.active && (
                      <p className="text-xs text-[rgb(var(--color-muted))]">
                        Hesap kimliği (izin listesi için): <code>{a.id}</code>
                      </p>
                    )}
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className={cn('font-semibold', a.status === 'active' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300')}>{STATUS_LABEL[a.status]}</span>
                      {a.statusReason && <span className="text-[rgb(var(--color-muted))]">{a.statusReason}</span>}
                      <span className="text-[rgb(var(--color-muted))]">Token: {formatExpiry(a)}</span>
                      <PermissionBadge a={a} />
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {a.status === 'active' && (
                      <button type="button" disabled={busy === a.id} onClick={() => void changeStatus(a.id, 'pause')} className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40">
                        <PauseCircle className="h-3.5 w-3.5" aria-hidden /> Duraklat
                      </button>
                    )}
                    {a.status === 'paused' && (
                      <button type="button" disabled={busy === a.id} onClick={() => void changeStatus(a.id, 'activate')} className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40">
                        <PlayCircle className="h-3.5 w-3.5" aria-hidden /> Etkinleştir
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy !== null || !data.config[a.platform].ready}
                      onClick={() => void startConnect({}, `/api/admin/social/accounts/${encodeURIComponent(a.id)}/reconnect`)}
                      title={a.connectionMethod === 'legacy' ? 'Aynı hesapla platform girişi yapılırsa bu kayıt yeni bağlantı yöntemine geçer; farklı hesapla giriş yapılırsa hiçbir şey değişmez.' : undefined}
                      className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden /> {a.connectionMethod === 'legacy' ? 'Platform girişiyle yeniden bağla' : 'Yeniden bağla'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
