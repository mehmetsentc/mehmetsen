'use client'

/**
 * «Sosyal hesaplarım» / «Hesaplar» — every user's account list on top of
 * /api/social/*. Connection, publish permission and automation are shown as
 * three separate states. Connecting always goes through the platform's own
 * OAuth screen; NaHaber never asks for a password or token.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, CheckCircle2, History, Link2, Loader2, PauseCircle, PlayCircle, Plus, RefreshCw, SlidersHorizontal, Stethoscope, Zap } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { TURKISH_PROVINCES, getDistrictsForProvince } from '@/constants/cities'
import { cn } from '@/lib/utils'
import { RESULT_MESSAGES, accountFormatsLabel } from '@/components/admin/social/SocialAccountsPanel'
import { TARGET_BLOCKER_TEXT } from '@/lib/social/accounts/capabilities'
import { PLATFORM_LABEL, ownerLabel, socialApi, type SocialAccountRow, type SocialMe } from './socialClient'
import { PublishScopeEditor } from './PublishScopeEditor'
import { CategoryPicker, categoriesText } from './CategoryPicker'
import { contentScopeLabel } from '@/lib/social/accounts/publishScope'
import type { AutomationGeo } from '@/lib/social/automation/types'

const PENDING_SCOPE_KEY = 'nahaber.social.pendingScope'

type ContentKindChoice = 'general' | 'location' | 'category' | 'location_category'
type ScopePrefill = { geo?: AutomationGeo; allCategories?: boolean; categoryIds?: string[] }
const CONTENT_KIND_LABEL: Record<ContentKindChoice, string> = { general: 'Genel', location: 'Konum', category: 'Kategori', location_category: 'Konum + kategori' }

/** Pending wizard data carried across the platform login (no secrets). */
function readPending(): { district: string | null; prefill: ScopePrefill | null } {
  try {
    const raw = sessionStorage.getItem(PENDING_SCOPE_KEY)
    sessionStorage.removeItem(PENDING_SCOPE_KEY)
    if (!raw) return { district: null, prefill: null }
    const v = JSON.parse(raw) as { district?: string | null; at?: number; prefill?: ScopePrefill | null }
    if (typeof v.at !== 'number' || Date.now() - v.at > 30 * 60_000) return { district: null, prefill: null }
    return { district: v.district ?? null, prefill: v.prefill ?? null }
  } catch {
    return { district: null, prefill: null }
  }
}

type OwnerChoice = { key: string; label: string; ownership: Record<string, string> & { kind: string } }
type RuleLite = { id: string; accountId: string; enabled: boolean }
type PageRow = { id: string; name: string; eligible: boolean }

const provinceName = (slug: string | null | undefined) => TURKISH_PROVINCES.find((p) => p.slug === slug)?.name ?? slug ?? ''

const fmtDate = (ms: number) => new Date(ms).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * Token lifetime as reported by the platform. «Otomatik yenileme» is only
 * claimed for Instagram Login / Threads (official refresh endpoints, run in
 * the shared 5-minute automation tick, ≤15 days before expiry) and the last
 * successful renewal is shown when there was one.
 */
function expiryText(a: SocialAccountRow): string {
  if (a.connectionMethod === 'legacy') return 'Eski (legacy) bağlantı'
  const renewable = a.connectionMethod === 'instagram_login' || a.connectionMethod === 'threads_oauth'
  const refreshed = a.tokenRefreshedAt ? ` · son yenileme ${fmtDate(a.tokenRefreshedAt)}` : renewable ? ' · henüz yenilenmedi' : ''
  if (a.tokenExpiresAt === null) return a.tokenExpiryVerified ? 'Platform: süresiz erişim (Sayfa erişimi)' : 'Platform erişim süresini bildirmedi'
  const ms = a.tokenExpiresAt - Date.now()
  if (ms <= 0) return 'Erişim süresi dolmuş — yeniden bağlayın'
  const days = Math.floor(ms / 86_400_000)
  const left = days >= 1 ? `Platform erişimi ${days} gün daha geçerli (${fmtDate(a.tokenExpiresAt)})` : 'Erişimin bitmesine bir günden az kaldı'
  return renewable ? `${left} · bitişe 15 gün kala otomatik yenileme denenir; başarısız olursa yeniden bağlantı istenir${refreshed}` : `${left} — süre dolunca yeniden bağlantı gerekir`
}

function geoText(g: NonNullable<SocialAccountRow['publishScope']>['geo']): string {
  return g.kind === 'any' ? 'tüm haberler (konumu belirsiz dahil)' : g.kind === 'national' ? 'ulusal kategoriler (yerel, Kıbrıs, Dünya hariç)' : g.kind === 'world' ? 'dünya haberleri' : g.kind === 'all_provinces' ? 'il bilgisi olan tüm haberler'
    : g.kind === 'provinces' ? g.citySlugs.map(provinceName).join(', ') : `${provinceName(g.citySlug)} / ${g.districtSlugs.length} ilçe`
}

function scopeText(sc: NonNullable<SocialAccountRow['publishScope']>): string {
  const parts: string[] = [`içerik kapsamı: ${contentScopeLabel(sc.geo, sc.allCategories)}`]
  if (sc.formats.includes('post')) parts.push(`gönderi: ${geoText(sc.geo)} · ${categoriesText(sc.allCategories, sc.categoryIds)}`)
  if (sc.formats.includes('story')) parts.push(`hikâye: ${geoText(sc.storyGeo ?? sc.geo)} · ${categoriesText(sc.storyAllCategories ?? sc.allCategories, sc.storyCategoryIds ?? sc.categoryIds)}`)
  return `${parts.join(' | ')} | ${sc.manualAccess === 'scope_editors' ? 'kapsamdaki editörler de' : 'yalnız yöneticiler'}`
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
  const [wizardOpen, setWizardOpen] = useState(false)
  const [districtSlug, setDistrictSlug] = useState('')
  const [scopeFor, setScopeFor] = useState<{ id: string; district: string | null; prefill?: ScopePrefill | null } | null>(null)
  const [contentKind, setContentKind] = useState<ContentKindChoice>('general')
  const [contentCity, setContentCity] = useState('')
  const [contentCats, setContentCats] = useState<{ all: boolean; ids: string[] }>({ all: false, ids: [] })
  const [fPlatform, setFPlatform] = useState('')
  const [fCity, setFCity] = useState('')
  const [fOwner, setFOwner] = useState('')
  const [fStatus, setFStatus] = useState('')

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

  // OAuth dönüşü (bağlandı) → 6. adım: yeni / yenilenen hesabın yayın kapsamı.
  const returnedAccount = searchParams.get('account')
  useEffect(() => {
    if (!returnedAccount || (resultCode !== 'connected' && resultCode !== 'connected_needs_attention')) return
    const { district, prefill } = readPending()
    setScopeFor({ id: returnedAccount, district, prefill })
  }, [returnedAccount, resultCode])

  const ownerChoices = useMemo<OwnerChoice[]>(() => {
    if (!me) return []
    const out: OwnerChoice[] = []
    out.push({ key: 'user', label: 'Kişisel', ownership: { kind: 'user' } })
    for (const p of me.publishers.filter((x) => x.canManage)) {
      out.push({ key: `publisher:${p.id}`, label: `Yayıncı: ${p.name}`, ownership: { kind: 'publisher', publisherId: p.id } })
    }
    if (mode === 'admin') {
      if (me.central) out.unshift({ key: 'central', label: 'Merkez', ownership: { kind: 'central' } })
      if (me.central || me.provinces.length > 0) out.splice(me.central ? 1 : 0, 0, { key: 'province', label: 'İl ekibi', ownership: { kind: 'province' } })
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

  /** Content scope chosen in the wizard → publish-scope prefill (ownership stays a separate field). */
  const wizardPrefill = (kind: string): ScopePrefill | null => {
    const isProvince = kind === 'province'
    const ck: ContentKindChoice = isProvince && (contentKind === 'general' || contentKind === 'category') ? (contentKind === 'general' ? 'location' : 'location_category') : contentKind
    const locCity = isProvince ? citySlug : contentCity
    const geo: AutomationGeo | undefined =
      ck === 'location' || ck === 'location_category'
        ? isProvince && districtSlug
          ? { kind: 'districts', citySlug, districtSlugs: [districtSlug] }
          : { kind: 'provinces', citySlugs: locCity ? [locCity] : [] }
        : { kind: 'any' }
    const cats = ck === 'category' || ck === 'location_category' ? { allCategories: contentCats.all, categoryIds: contentCats.all ? [] : contentCats.ids } : { allCategories: true, categoryIds: [] }
    return { geo, ...cats }
  }
  const contentIncomplete = (kind: string) => {
    const needsCity = kind !== 'province' && (contentKind === 'location' || contentKind === 'location_category') && !contentCity
    const needsCats = (contentKind === 'category' || contentKind === 'location_category') && !contentCats.all && contentCats.ids.length === 0
    return needsCity || needsCats
  }

  const startConnect = async () => {
    const choice = ownerChoices.find((c) => c.key === ownerKey)
    if (!choice) return
    // Merkez / Kişisel: no il needed — ownership is the explicit kind, never inferred from an empty location.
    const ownership = choice.ownership.kind === 'province' ? { kind: 'province', citySlug } : choice.ownership
    if (ownership.kind === 'province' && !citySlug) return
    if (contentIncomplete(ownership.kind)) return
    setBusy('connect')
    try {
      try {
        // Yayın kapsamı opens after the platform returns, pre-filled with the wizard's content scope (no secrets).
        sessionStorage.setItem(PENDING_SCOPE_KEY, JSON.stringify({ district: ownership.kind === 'province' && districtSlug ? districtSlug : null, prefill: wizardPrefill(ownership.kind), at: Date.now() }))
      } catch {
        /* optional */
      }
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

  const disconnect = async (a: SocialAccountRow) => {
    if (!window.confirm(`«${a.displayName}» bağlantısı kaldırılsın mı?\n\nErişim anahtarı ve platform profil bilgileri silinir, otomasyon kuralları kapatılır. Paylaşım geçmişi korunur. Yeniden kullanmak için platform girişiyle tekrar bağlamanız gerekir.`)) return
    setBusy(`dc:${a.id}`)
    const r = await socialApi<{ disconnected: boolean }>(`/api/social/accounts/${encodeURIComponent(a.id)}`, { method: 'DELETE' })
    setBusy(null)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    toast.success('Bağlantı kaldırıldı; erişim anahtarı silindi.')
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
    const r = await socialApi<{ status: string; accountId: string }>('/api/social/facebook-pages', { method: 'POST', body: JSON.stringify({ session: fbSelect, pageId: selectedPage }) })
    setBusy(null)
    if (!r.ok) {
      toast.error(RESULT_MESSAGES[r.code ?? '']?.text ?? 'Sayfa bağlanamadı.')
      return
    }
    toast.success(r.data.status === 'active' ? 'Facebook sayfası bağlandı.' : RESULT_MESSAGES.connected_needs_attention.text)
    const { district, prefill } = readPending()
    clearQuery()
    await load()
    setScopeFor({ id: r.data.accountId, district, prefill })
  }

  const shown = useMemo(
    () =>
      (ownerFilter ? accounts.filter(ownerFilter) : accounts).filter(
        (a) =>
          (!fPlatform || a.platform === fPlatform) &&
          (!fCity || a.ownership.citySlug === fCity) &&
          (!fOwner || a.ownerKind === fOwner) &&
          (!fStatus || (fStatus === 'ready' ? a.status === 'active' && !a.health.publishBlocker : fStatus === 'attention' ? a.status !== 'active' || !!a.health.publishBlocker : true)),
      ),
    [accounts, ownerFilter, fPlatform, fCity, fOwner, fStatus],
  )
  const cityOptions = useMemo(() => [...new Set(accounts.map((a) => a.ownership.citySlug).filter((c): c is string => !!c))], [accounts])
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
          <p className="text-xs text-[rgb(var(--color-muted))]">
            Liste, Facebook’un bu giriş için döndürdüğü Sayfaların tamamıdır (sayfalı yanıt sonuna kadar okunur; NaHaber filtrelemez). Beklediğiniz Sayfa yoksa NaHaber’e o Sayfa için izin verilmemiştir:{' '}
            <a href="https://www.facebook.com/settings/?tab=business_tools" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
              İşletme entegrasyonları → NaHaber → Gör ve düzenle
            </a>{' '}
            bölümünde Sayfayı işaretleyip kaydedin ve Facebook bağlantısını yeniden başlatın.
          </p>
          <button type="button" onClick={clearQuery} className="text-xs text-[rgb(var(--color-muted))] underline">
            Vazgeç
          </button>
        </div>
      )}

      {ownerChoices.length > 0 && !wizardOpen && (
        <button type="button" onClick={() => setWizardOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" aria-hidden /> Yeni hesap ekle
        </button>
      )}

      {ownerChoices.length > 0 && wizardOpen && (
        <form
          className="space-y-3 rounded-xl border border-dashed border-[rgb(var(--color-border))] p-3 text-sm"
          aria-label="Yeni hesap ekle"
          onSubmit={(e) => {
            e.preventDefault()
            void startConnect()
          }}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Yeni hesap ekle</h3>
            <button type="button" onClick={() => setWizardOpen(false)} className="text-xs underline">
              Vazgeç
            </button>
          </div>
          <ol className="space-y-3">
            <li>
              <span className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">1. Platform</span>
              <div className="flex flex-wrap gap-2">
                {(['instagram', 'facebook', 'threads'] as const).map((p) => (
                  <label key={p} className={cn('inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-2.5 py-1.5', !readyPlatforms.includes(p) && 'opacity-50')}>
                    <input type="radio" name="wiz-platform" disabled={!readyPlatforms.includes(p)} checked={platform === p} onChange={() => setPlatform(p)} />
                    {PLATFORM_LABEL[p]}
                    {!readyPlatforms.includes(p) && ' (yapılandırılmadı)'}
                  </label>
                ))}
              </div>
              {platform === 'instagram' && (
                <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
                  Instagram API ile yalnız profesyonel (İşletme veya İçerik Üreticisi) hesaplara yayın yapılabilir. Kişisel Instagram hesapları bağlanamaz; önce Instagram uygulamasında hesabı profesyonele çevirin.
                </p>
              )}
              {me?.platforms?.[platform]?.appId && (
                <p className="mt-1 text-[11px] text-[rgb(var(--color-muted))]">OAuth uygulama kimliği (herkese açık): {me.platforms[platform].appId}</p>
              )}
              {platform === 'facebook' && (
                <div className="mt-1 space-y-1 text-xs text-[rgb(var(--color-muted))]">
                  <p>Facebook’ta kişisel profil değil, yönettiğiniz bir Sayfa bağlanır; girişten sonra Sayfayı seçersiniz. Her Sayfa ayrı hesap olarak kaydedilir.</p>
                  <p className="rounded-lg bg-[rgb(var(--color-surface))] px-2 py-1.5">
                    <b>Sayfa listede çıkmıyorsa:</b> Facebook, NaHaber’e daha önce izin verdiğiniz Sayfaları hatırlar ve yalnız onları döndürür. Giriş ekranında «Ayarları düzenle / Önceki ayarları düzenle» ile eklemek istediğiniz Sayfaları işaretleyin ya da{' '}
                    <a href="https://www.facebook.com/settings/?tab=business_tools" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                      Facebook → İşletme entegrasyonları → NaHaber → Gör ve düzenle
                    </a>{' '}
                    bölümünde Sayfaları işaretleyip kaydedin, sonra yeniden bağlanın. İzin onayını yalnız siz verebilirsiniz.
                  </p>
                </div>
              )}
              {me?.platforms?.[platform]?.publicAccess !== 'approved' && (
                <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  Uygulamanın genel hesap bağlantısı onayı bekleniyor (Meta incelemesi). Şimdilik yalnız NaHaber uygulamasında rolü olan hesaplar bağlanabilir; diğer hesaplar platformun giriş ekranında «Yetersiz geliştirici görevi» benzeri bir uyarı görür.
                </p>
              )}
            </li>
            <li>
              <span className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">2. Sahiplik</span>
              <div className="flex flex-wrap gap-2">
                {ownerChoices.map((c) => (
                  <label key={c.key} className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-2.5 py-1.5">
                    <input type="radio" name="wiz-owner" checked={ownerKey === c.key} onChange={() => setOwnerKey(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-[rgb(var(--color-muted))]">
                {ownerChoice?.ownership.kind === 'central'
                  ? 'Merkez hesabı için il veya ilçe gerekmez; hangi haberlerin gideceğini aşağıdaki içerik kapsamı belirler.'
                  : ownerChoice?.ownership.kind === 'province'
                    ? 'İl ekibi hesabı için il zorunludur; il yöneticileri yalnız yetkili oldukları illeri seçebilir.'
                    : 'Kişisel hesap yalnız sizin kullanıcınıza bağlanır.'}
              </p>
            </li>
            {ownerChoice?.ownership.kind === 'province' && (
              <li>
                <span className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">3. İl ve isteğe bağlı ilçe</span>
                <div className="flex flex-wrap gap-2">
                  <select value={citySlug} onChange={(e) => { setCitySlug(e.target.value); setDistrictSlug('') }} required className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5">
                    <option value="">İl seçin</option>
                    {provinceChoices.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {citySlug && (
                    <select value={districtSlug} onChange={(e) => setDistrictSlug(e.target.value)} className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5">
                      <option value="">Tüm il (ilçe seçme)</option>
                      {getDistrictsForProvince(citySlug).map((d) => (
                        <option key={d.slug} value={d.slug}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </li>
            )}
            <li>
              <span className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">{ownerChoice?.ownership.kind === 'province' ? '4' : '3'}. İçerik kapsamı</span>
              <div className="flex flex-wrap gap-2">
                {(ownerChoice?.ownership.kind === 'province' ? (['location', 'location_category'] as const) : (['general', 'location', 'category', 'location_category'] as const)).map((k) => (
                  <label key={k} className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-2.5 py-1.5">
                    <input
                      type="radio"
                      name="wiz-content"
                      checked={contentKind === k || (ownerChoice?.ownership.kind === 'province' && k === 'location' && (contentKind === 'general' || contentKind === 'location'))}
                      onChange={() => setContentKind(k)}
                    />
                    {CONTENT_KIND_LABEL[k]}
                  </label>
                ))}
              </div>
              {ownerChoice?.ownership.kind !== 'province' && (contentKind === 'location' || contentKind === 'location_category') && (
                <select value={contentCity} onChange={(e) => setContentCity(e.target.value)} className="mt-2 rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5">
                  <option value="">Konum (il) seçin</option>
                  {TURKISH_PROVINCES.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              {(contentKind === 'category' || contentKind === 'location_category') && (
                <div className="mt-2">
                  <CategoryPicker legend="Kategoriler" all={contentCats.all} ids={contentCats.ids} onChange={setContentCats} />
                </div>
              )}
              <p className="mt-1 text-[11px] text-[rgb(var(--color-muted))]">
                Genel = tüm konumlar ve tüm kategoriler. Konum + kategori VE ile eşleşir. Bu manuel gönderi kapsamıdır; manuel hikâye kapsamı ve otomasyon kuralları ayrıca düzenlenir. Bağlantıdan sonra kaydetmeden önce gözden geçirirsiniz.
              </p>
            </li>
            <li>
              <span className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">{ownerChoice?.ownership.kind === 'province' ? '5' : '4'}. Platformda giriş ve izin</span>
              <button
                type="submit"
                disabled={busy === 'connect' || !readyPlatforms.includes(platform) || (ownerChoice?.ownership.kind === 'province' && !citySlug) || contentIncomplete(ownerChoice?.ownership.kind ?? '')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
              >
                <Link2 className="h-4 w-4" aria-hidden /> {PLATFORM_LABEL[platform]}’da giriş yap ve izin ver
              </button>
              <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
                Giriş ve izin {PLATFORM_LABEL[platform]}’ın kendi ekranında yapılır. NaHaber şifrenizi görmez, kullanıcı adını elle yazmak hesabı bağlamaz; kimlik platform onayıyla doğrulanır. Erişim anahtarı sunucuda şifreli saklanır ve size gösterilmez.
              </p>
            </li>
            <li className="text-xs text-[rgb(var(--color-muted))]">
              Sonra: {platform === 'facebook' ? 'bağlanacak Sayfayı seçin, ' : ''}bağlantı doğrulanır ve yayın kapsamını belirlersiniz. Yeni hesapta otomatik paylaşım kapalıdır.
            </li>
          </ol>
        </form>
      )}

      {accounts.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Hesap filtreleri">
          <select value={fPlatform} onChange={(e) => setFPlatform(e.target.value)} className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1">
            <option value="">Tüm platformlar</option>
            {(['instagram', 'facebook', 'threads'] as const).map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABEL[p]}
              </option>
            ))}
          </select>
          <select value={fCity} onChange={(e) => setFCity(e.target.value)} className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1">
            <option value="">Tüm iller</option>
            {cityOptions.map((c) => (
              <option key={c} value={c}>
                {provinceName(c)}
              </option>
            ))}
          </select>
          <select value={fOwner} onChange={(e) => setFOwner(e.target.value)} className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1">
            <option value="">Tüm sahiplikler</option>
            <option value="central">Merkez</option>
            <option value="province">İl</option>
            <option value="publisher">Yayıncı</option>
            <option value="user">Kişisel</option>
          </select>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1">
            <option value="">Tüm durumlar</option>
            <option value="ready">Yayına hazır</option>
            <option value="attention">İşlem gerekli</option>
          </select>
        </div>
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
                      {PLATFORM_LABEL[a.platform]} · {a.ownerKind === 'province' ? `Sahiplik: İl ekibi · ${provinceName(a.ownership.citySlug)}` : ownerLabel(a, me?.publishers ? Object.fromEntries(me.publishers.map((p) => [p.id, p.name])) : {})} · {accountFormatsLabel(a)}
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
                      {a.connectionMethod !== 'legacy' && (
                        <button type="button" onClick={() => setScopeFor(scopeFor?.id === a.id ? null : { id: a.id, district: null })} className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 text-xs">
                          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> Yayın kapsamını düzenle
                        </button>
                      )}
                      <Link href={mode === 'admin' ? `/admin/social/automation?account=${encodeURIComponent(a.id)}` : `/settings/social?tab=rules`} className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 text-xs">
                        <Zap className="h-3.5 w-3.5" aria-hidden /> Otomasyon kuralı
                      </Link>
                      {a.connectionMethod !== 'legacy' && a.status !== 'disabled' && (
                        <button type="button" disabled={busy === `dc:${a.id}`} onClick={() => void disconnect(a)} className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-800 dark:text-red-300">
                          Bağlantıyı kaldır
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5" aria-label="Durumlar">
                  <Pill tone={a.status === 'disabled' ? 'muted' : a.status === 'paused' ? 'warn' : 'ok'}>
                    {a.status === 'disabled' ? 'Bağlı değil' : a.status === 'paused' ? 'Bağlı · duraklatıldı' : 'Bağlı'}
                  </Pill>
                  {a.status === 'needs_reauth' || blocker === 'token_expired' || blocker === 'status_needs_reauth' || blocker === 'publish_permission_missing' ? (
                    <Pill tone="bad">Yeniden bağlantı gerekli</Pill>
                  ) : blocker ? (
                    <Pill tone="warn">Yayınlanamaz: {TARGET_BLOCKER_TEXT[blocker]}</Pill>
                  ) : (
                    <Pill tone="ok">Yayınlanabilir</Pill>
                  )}
                  <Pill tone={autoCount > 0 ? 'ok' : 'muted'}>{autoCount > 0 ? `Otomasyon açık (${autoCount} kural)` : 'Otomasyon kapalı'}</Pill>
                  <span className="text-[11px] text-[rgb(var(--color-muted))]" title="«Otomasyonu durdur» yalnız otomatik paylaşımı keser (kurallar sayfasında). «Hesabı duraklat» bu hesaptan manuel ve otomatik bütün yayını durdurur.">ⓘ</span>
                  {!a.canPublish && <Pill tone="muted">Yalnızca görüntüleme</Pill>}
                </div>
                {a.status === 'needs_reauth' && a.statusReason && <p className="text-xs font-semibold text-red-700 dark:text-red-300">{a.statusReason}</p>}
                {a.canPublish && (
                  <Link href={mode === 'admin' ? `/admin/social/shares?account=${encodeURIComponent(a.id)}` : '/settings/social?tab=history'} className="inline-flex items-center gap-1 text-xs underline">
                    <History className="h-3.5 w-3.5" aria-hidden /> Paylaşım geçmişini aç
                  </Link>
                )}
                {a.publishScope && <p className="text-xs text-[rgb(var(--color-muted))]">Manuel kapsam — {scopeText(a.publishScope)}</p>}
                {a.connectionMethod !== 'legacy' && (
                  <p className="text-xs text-[rgb(var(--color-muted))]">
                    Son bağlantı kontrolü: {a.connectionCheckedAt ? fmtDate(a.connectionCheckedAt) : 'yapılmadı'}
                    {a.grantedPermissions?.length ? ` · platform izinleri: ${a.grantedPermissions.join(', ')}` : ''}
                  </p>
                )}
                {scopeFor?.id === a.id && a.canManage && a.publishScope && (
                  <PublishScopeEditor
                    account={a as SocialAccountRow & { publishScope: NonNullable<SocialAccountRow['publishScope']> }}
                    provinceChoices={provinceChoices.map((p) => ({ slug: p.slug, name: p.name }))}
                    initialDistrict={scopeFor.district}
                    prefill={scopeFor.prefill ?? null}
                    automationHref={mode === 'admin' ? `/admin/social/automation?account=${encodeURIComponent(a.id)}` : '/settings/social?tab=rules'}
                    onClose={() => setScopeFor(null)}
                    onSaved={() => {
                      setScopeFor(null)
                      void load()
                    }}
                  />
                )}
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
