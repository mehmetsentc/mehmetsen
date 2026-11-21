'use client'

/**
 * Right-hand detail of ONE account in «Sosyal hesaplar». Opening the panel or
 * switching tabs never writes anything: Genel / Yayın kapsamı / Otomasyon use
 * the rows already loaded for the list; «Geçmiş» is fetched only when its tab
 * is opened, for this account only. Editing reuses PublishScopeEditor (server
 * validation unchanged) and reports unsaved changes to the workspace.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronDown, ExternalLink, History, Loader2, MessageCircle, PauseCircle, PlayCircle, RefreshCw, SlidersHorizontal, Stethoscope, X, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { accountFormatsLabel } from '@/components/admin/social/SocialAccountsPanel'
import { PublishScopeEditor } from '@/components/social/PublishScopeEditor'
import { categoriesText } from '@/components/social/CategoryPicker'
import { socialApi, type SocialAccountRow, type SocialMe } from '@/components/social/socialClient'
import { TARGET_BLOCKER_TEXT, type TargetBlocker } from '@/lib/social/accounts/capabilities'
import { confirmDiscard, createLatestGuard, type AccountState } from '@/lib/social/accounts/accountListView'
import type { AutomationGeo } from '@/lib/social/automation/types'
import type { AutomationJobPublic } from '@/lib/social/automation/jobs'
import { checkConnection, disconnectAccount, engagementMissing, inboxMissing, setAccountStatus, startReconnect } from './accountActions'
import { AccountAvatar, AutomationPill, PlatformLabel, StatePill, expiryText, fmtDate, ownershipText, provinceName } from './accountUi'

export type DetailTab = 'general' | 'scope' | 'automation' | 'history'
const TABS: Array<{ id: DetailTab; label: string }> = [
  { id: 'general', label: 'Genel' },
  { id: 'scope', label: 'Yayın kapsamı' },
  { id: 'automation', label: 'Otomasyon' },
  { id: 'history', label: 'Geçmiş' },
]

export type RuleRow = { id: string; accountId: string; enabled: boolean; name?: string; summary?: string; canManage?: boolean; formats?: string[]; dailyLimit?: number }
type ScopePrefill = { geo?: AutomationGeo; allCategories?: boolean; categoryIds?: string[] } | null

const PERMISSION_TEXT: Record<SocialAccountRow['publishPermission'], string> = {
  verified: 'Yayın izni doğrulandı',
  missing: 'Yayın izni eksik',
  unverified: 'Yayın izni doğrulanmadı',
  legacy: 'Eski bağlantı — izin bilgisi tutulmuyor',
}

const METHOD_TEXT: Record<string, string> = {
  legacy: 'Eski (legacy) Onyeditivi bağlantısı',
  facebook_login: 'Facebook Login (Sayfa)',
  instagram_login: 'Instagram Login',
  threads_oauth: 'Threads OAuth',
  google_oauth: 'Google OAuth (YouTube)',
  tiktok_oauth: 'TikTok Login',
}

function geoLong(g: AutomationGeo): string {
  switch (g.kind) {
    case 'any':
      return 'Tüm konumlar (konumu belirsiz haberler dahil)'
    case 'national':
      return 'Ulusal kategoriler (yerel, Kıbrıs, Dünya hariç)'
    case 'world':
      return 'Dünya haberleri'
    case 'all_provinces':
      return 'İl bilgisi olan tüm haberler'
    case 'provinces':
      return g.citySlugs.length ? g.citySlugs.map(provinceName).join(', ') : 'İl seçilmedi'
    case 'districts':
      return `${provinceName(g.citySlug)} · ${g.districtSlugs.length} ilçe`
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-3 gap-y-0.5 py-2 text-sm max-[420px]:grid-cols-1">
      <dt className="text-[rgb(var(--color-muted))]">{label}</dt>
      <dd className="min-w-0 break-words text-[rgb(var(--color-text))]">{children}</dd>
    </div>
  )
}

function Section({ title, icon, children, className }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-[rgb(var(--color-border))] p-3', className)}>
      <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-[rgb(var(--color-text))]">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

const btn = 'inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm font-medium hover:bg-[rgb(var(--color-surface))] disabled:opacity-50'

export function AccountDetailPanel({
  account,
  state,
  rules,
  me,
  overlay,
  initialTab,
  returned,
  onRequestClose,
  onDirtyChange,
  onChanged,
}: {
  account: SocialAccountRow
  state: AccountState
  rules: RuleRow[]
  me: SocialMe | null
  /** Drawer over the list (narrow screens) vs docked beside it. */
  overlay: boolean
  initialTab: DetailTab
  /** Set right after a platform login returned this account: scope editor opens with the wizard's prefill (unsaved). */
  returned: { district: string | null; prefill: ScopePrefill } | null
  onRequestClose: () => void
  onDirtyChange: (dirty: boolean) => void
  /** Reload the list rows after a successful change (scope save: accounts only). */
  onChanged: (what?: 'all' | 'accounts') => void
}) {
  const [tab, setTab] = useState<DetailTab>(initialTab)
  const [editing, setEditing] = useState(returned !== null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const headingId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const a = account
  const legacy = a.connectionMethod === 'legacy'
  const publisherNames = useMemo(() => Object.fromEntries((me?.publishers ?? []).map((p) => [p.id, p.name])), [me])
  const provinceChoices = useMemo(
    () => (me?.central ? TURKISH_PROVINCES : TURKISH_PROVINCES.filter((p) => me?.provinces.includes(p.slug))).map((p) => ({ slug: p.slug, name: p.name })),
    [me],
  )

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  const reportDirty = useCallback(
    (d: boolean) => {
      setDirty(d)
      onDirtyChange(d)
    },
    [onDirtyChange],
  )

  const goTab = (t: DetailTab) => {
    if (t === tab) return
    if (!confirmDiscard(dirty, (m) => window.confirm(m))) return
    if (dirty) reportDirty(false)
    setEditing(false)
    setTab(t)
  }

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const last = TABS.length - 1
    const next = e.key === 'ArrowRight' ? (i === last ? 0 : i + 1) : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : null
    if (next === null) return
    e.preventDefault()
    tabRefs.current[next]?.focus()
    goTab(TABS[next].id)
  }

  const run = async (key: string, fn: () => Promise<boolean | void>, reload = true) => {
    if (busy) return
    setBusy(key)
    try {
      const ok = await fn()
      if (ok && reload) onChanged()
    } finally {
      setBusy(null)
    }
  }

  const blocker = a.health.publishBlocker as TargetBlocker | null
  const accountRules = rules.filter((r) => r.accountId === a.id)
  const enabledCount = accountRules.filter((r) => r.enabled).length

  return (
    <div className="flex h-full min-h-0 flex-col" aria-labelledby={headingId}>
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-[rgb(var(--color-border))] p-4">
        <AccountAvatar name={a.displayName} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="truncate text-lg font-bold text-[rgb(var(--color-text))]" title={a.displayName}>
            {a.displayName}
          </h2>
          {a.username && (
            <p className="truncate text-sm text-[rgb(var(--color-muted))]" title={`@${a.username}`}>
              @{a.username}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-[rgb(var(--color-surface))] px-2 py-0.5">
              <PlatformLabel platform={a.platform} />
            </span>
            <StatePill state={state} />
          </div>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onRequestClose}
          aria-label={`${a.displayName} ayrıntılarını kapat`}
          className="-mr-1 -mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))]"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Hesap ayrıntıları" className="flex shrink-0 gap-1 overflow-x-auto border-b border-[rgb(var(--color-border))] px-2">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el
            }}
            role="tab"
            type="button"
            id={`${headingId}-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${headingId}-panel`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => goTab(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
            className={cn(
              'min-h-11 whitespace-nowrap border-b-2 px-3 text-sm font-semibold',
              tab === t.id ? 'border-[rgb(var(--color-brand))] text-[rgb(var(--color-brand))]' : 'border-transparent text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]',
            )}
          >
            {t.label}
            {t.id === 'automation' && enabledCount > 0 ? <span className="ml-1 text-xs">({enabledCount})</span> : null}
          </button>
        ))}
      </div>

      <div id={`${headingId}-panel`} role="tabpanel" aria-labelledby={`${headingId}-tab-${tab}`} className={cn('min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4', overlay && 'pb-[max(1rem,env(safe-area-inset-bottom))]')}>
        {tab === 'general' && (
          <>
            {(state === 'reconnect' || a.status === 'needs_reauth') && a.canManage && !legacy && (
              <div role="status" className="flex flex-wrap items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Bu hesap yeniden bağlanmalı.</p>
                  {a.statusReason && <p className="text-xs">{a.statusReason}</p>}
                </div>
                <button type="button" disabled={!!busy} onClick={() => void run('re', () => startReconnect(a), false)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[rgb(var(--color-brand))] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                  <RefreshCw className="h-4 w-4" aria-hidden /> Yeniden bağla
                </button>
              </div>
            )}

            <dl className="divide-y divide-[rgb(var(--color-border))] rounded-xl border border-[rgb(var(--color-border))] px-3">
              <Row label="Hesabı yöneten">{ownershipText(a, publisherNames)}</Row>
              <Row label="Bağlantı">
                {a.status === 'disabled' ? 'Bağlı değil' : legacy ? 'Eski (legacy) bağlantı' : 'Bağlı'}
                {blocker && blocker !== 'status_paused' ? <span className="block text-xs text-amber-700 dark:text-amber-300">Yayın engeli: {TARGET_BLOCKER_TEXT[blocker]}</span> : null}
              </Row>
              <Row label="Yayın yetkisi">
                {PERMISSION_TEXT[a.publishPermission]}
                {!a.canPublish && <span className="block text-xs text-[rgb(var(--color-muted))]">Sizin için yalnızca görüntüleme</span>}
              </Row>
              <Row label="Duraklatılmış">{a.status === 'paused' ? 'Evet — manuel ve otomatik yayın durdu' : 'Hayır'}</Row>
              <Row label="Desteklenen biçimler">{accountFormatsLabel(a)}</Row>
              <Row label="Son bağlantı kontrolü">{legacy ? '—' : a.connectionCheckedAt ? fmtDate(a.connectionCheckedAt) : 'Henüz kontrol edilmedi'}</Row>
              <Row label="Erişim süresi">
                <span className={cn(a.health.tokenWarning && 'text-amber-700 dark:text-amber-300')}>{expiryText(a)}</span>
                {a.tokenWarning ? <span className="block text-xs text-amber-700 dark:text-amber-300">{a.tokenWarning}</span> : null}
              </Row>
            </dl>

            {a.canManage && (
              <Section title="Bağlantı işlemleri">
                <p className="mb-2 text-xs text-[rgb(var(--color-muted))]">Kontrol yalnızca platformdan okuma yapar; paylaşım yapmaz. Duraklatma bu hesaptan manuel ve otomatik bütün yayını durdurur.</p>
                <div className="flex flex-wrap gap-2">
                  {!legacy && (
                    <button type="button" className={btn} disabled={!!busy} onClick={() => void run('ck', () => checkConnection(a))}>
                      {busy === 'ck' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Stethoscope className="h-4 w-4" aria-hidden />} Bağlantıyı kontrol et
                    </button>
                  )}
                  {a.status === 'active' ? (
                    <button type="button" className={btn} disabled={!!busy} onClick={() => void run('st', () => setAccountStatus(a, 'pause'))}>
                      <PauseCircle className="h-4 w-4" aria-hidden /> Hesabı duraklat
                    </button>
                  ) : a.status === 'paused' ? (
                    <button type="button" className={btn} disabled={!!busy} onClick={() => void run('st', () => setAccountStatus(a, 'activate'))}>
                      <PlayCircle className="h-4 w-4" aria-hidden /> Devam ettir
                    </button>
                  ) : null}
                  {!legacy && state !== 'reconnect' && (
                    <button type="button" className={btn} disabled={!!busy} onClick={() => void run('re', () => startReconnect(a), false)}>
                      <RefreshCw className="h-4 w-4" aria-hidden /> Platform girişiyle yeniden bağla
                    </button>
                  )}
                </div>
              </Section>
            )}

            {!legacy && (
              <Section title="Yorum, etkileşim ve mesaj izinleri" icon={<MessageCircle className="h-4 w-4" aria-hidden />}>
                <ul className="space-y-1 text-sm">
                  <li>Etkileşim ve yorumları okuma: {engagementMissing(a).length === 0 ? 'izin verildi' : 'izin verilmedi'}</li>
                  <li>
                    {a.platform === 'instagram' || a.platform === 'facebook' ? 'Yorumlara cevap ve özel mesajlar' : 'Yorumlara cevap'}: {inboxMissing(a).length === 0 ? 'izin verildi' : 'izin verilmedi'}
                  </li>
                </ul>
                {a.canManage && (engagementMissing(a).length > 0 || inboxMissing(a).length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {engagementMissing(a).length > 0 && (
                      <button type="button" className={btn} disabled={!!busy} onClick={() => void run('en', () => startReconnect(a, 'engagement'), false)}>
                        Etkileşim ve yorum izni ver
                      </button>
                    )}
                    {inboxMissing(a).length > 0 && (
                      <button type="button" className={btn} disabled={!!busy} onClick={() => void run('ib', () => startReconnect(a, 'inbox'), false)}>
                        {a.platform === 'instagram' || a.platform === 'facebook' ? 'Mesaj ve cevap izni ver' : 'Yorumlara cevap izni ver'}
                      </button>
                    )}
                  </div>
                )}
                <p className="mt-2 text-xs text-[rgb(var(--color-muted))]">İzin, platformun kendi giriş ekranında verilir; yayın izinleri değişmez.</p>
              </Section>
            )}

            <details className="group rounded-xl border border-[rgb(var(--color-border))] p-3 text-sm">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-[rgb(var(--color-muted))]">
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden /> Teknik ayrıntılar
              </summary>
              <dl className="mt-2 divide-y divide-[rgb(var(--color-border))]">
                <Row label="Bağlantı yöntemi">{METHOD_TEXT[a.connectionMethod] ?? a.connectionMethod}</Row>
                <Row label="NaHaber hesap kimliği">
                  <code className="break-all text-xs">{a.id}</code>
                </Row>
                <Row label="Dış hesap kimliği">
                  <code className="break-all text-xs">{a.externalId}</code>
                </Row>
                {a.platformAccountType && <Row label="Hesap türü">{a.platformAccountType}</Row>}
                <Row label="Verilen kapsamlar">
                  <span className="break-all text-xs">{a.grantedPermissions?.length ? a.grantedPermissions.join(', ') : 'doğrulanmadı'}</span>
                </Row>
                <Row label="Yayın için gerekli">
                  <span className="break-all text-xs">{a.requiredPermissions.length ? a.requiredPermissions.join(', ') : '—'}</span>
                </Row>
                {blocker && (
                  <Row label="Engel kodu">
                    <code className="text-xs">{blocker}</code>
                  </Row>
                )}
                <Row label="İzin doğrulaması">{a.permissionsVerifiedAt ? fmtDate(a.permissionsVerifiedAt) : '—'}</Row>
              </dl>
              <p className="mt-2 text-xs text-[rgb(var(--color-muted))]">Erişim anahtarları sunucuda şifreli saklanır ve hiçbir ekranda gösterilmez.</p>
            </details>

            {a.canManage && !legacy && a.status !== 'disabled' && (
              <section className="rounded-xl border border-red-200 p-3 dark:border-red-900" aria-label="Tehlikeli işlemler">
                <h3 className="text-sm font-bold text-red-800 dark:text-red-200">Tehlikeli işlemler</h3>
                <p className="mb-2 text-xs text-[rgb(var(--color-muted))]">Erişim anahtarı ve platform profil bilgileri silinir, otomasyon kuralları kapatılır. Paylaşım geçmişi korunur.</p>
                <button type="button" disabled={!!busy} onClick={() => void run('dc', () => disconnectAccount(a))} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40">
                  Bağlantıyı kaldır
                </button>
              </section>
            )}
          </>
        )}

        {tab === 'scope' &&
          (!a.publishScope ? (
            <p className="rounded-xl bg-[rgb(var(--color-surface))] p-3 text-sm text-[rgb(var(--color-muted))]">Bu eski (legacy) bağlantının hesap bazlı yayın kapsamı yok. Kapsam, hesap platform girişiyle yeniden bağlandığında tanımlanır.</p>
          ) : editing && a.canManage ? (
            <PublishScopeEditor
              embedded
              account={a as SocialAccountRow & { publishScope: NonNullable<SocialAccountRow['publishScope']> }}
              provinceChoices={provinceChoices}
              initialDistrict={returned?.district ?? null}
              prefill={returned?.prefill ?? null}
              automationHref={`/admin/social/automation?account=${encodeURIComponent(a.id)}`}
              onDirtyChange={reportDirty}
              onClose={() => {
                if (!confirmDiscard(dirty, (m) => window.confirm(m))) return
                reportDirty(false)
                setEditing(false)
              }}
              onSaved={() => {
                reportDirty(false)
                setEditing(false)
                onChanged('accounts')
              }}
            />
          ) : (
            <>
              <Section title="Gönderi">
                <dl className="divide-y divide-[rgb(var(--color-border))]">
                  <Row label="Konum">{geoLong(a.publishScope.geo)}</Row>
                  <Row label="Kategoriler">{categoriesText(a.publishScope.allCategories, a.publishScope.categoryIds)}</Row>
                  <Row label="İzinli">{a.publishScope.formats.includes('post') ? 'Evet' : a.formats.includes('post') ? 'Hayır (kapsamda kapalı)' : 'Hesap desteklemiyor'}</Row>
                </dl>
              </Section>
              <Section title="Hikâye">
                <dl className="divide-y divide-[rgb(var(--color-border))]">
                  <Row label="Konum">{geoLong(a.publishScope.storyGeo ?? a.publishScope.geo)}</Row>
                  <Row label="Kategoriler">{categoriesText(a.publishScope.storyAllCategories ?? a.publishScope.allCategories, a.publishScope.storyCategoryIds ?? a.publishScope.categoryIds)}</Row>
                  <Row label="İzinli">{a.publishScope.formats.includes('story') ? 'Evet' : a.formats.includes('story') ? 'Hayır (kapsamda kapalı)' : 'Hesap desteklemiyor'}</Row>
                </dl>
              </Section>
              <Section title="Diğer biçimler ve erişim">
                <dl className="divide-y divide-[rgb(var(--color-border))]">
                  <Row label="Yayımlanabilir">{accountFormatsLabel(a)}</Row>
                  <Row label="Manuel paylaşım">{a.publishScope.manualAccess === 'scope_editors' ? 'Hesabı yönetenler ve kapsamdaki editörler' : 'Yalnız hesabı yönetenler'}</Row>
                </dl>
                <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">Reels / video paylaşımı Reels ve Video Stüdyosu ekranlarından yapılır. Otomatik paylaşımın kendi koşulları Otomasyon sekmesindedir.</p>
              </Section>
              {a.publishScope.updatedAt ? <p className="text-xs text-[rgb(var(--color-muted))]">Son kapsam değişikliği: {fmtDate(a.publishScope.updatedAt)}</p> : null}
              {a.canManage ? (
                <button type="button" onClick={() => setEditing(true)} className={btn}>
                  <SlidersHorizontal className="h-4 w-4" aria-hidden /> Kapsamı düzenle
                </button>
              ) : (
                <p className="text-xs text-[rgb(var(--color-muted))]">Bu hesabın kapsamını yalnız hesabı yönetenler değiştirebilir.</p>
              )}
            </>
          ))}

        {tab === 'automation' && (
          <>
            <div className="flex items-center justify-between gap-2">
              <AutomationPill count={enabledCount} />
              <span className="text-xs text-[rgb(var(--color-muted))]">{accountRules.length} kural</span>
            </div>
            {accountRules.length === 0 ? (
              <p className="rounded-xl bg-[rgb(var(--color-surface))] p-3 text-sm text-[rgb(var(--color-muted))]">Bu hesabın otomasyon kuralı yok. Kurallar kapalı oluşturulur ve ayrıca açılır.</p>
            ) : (
              <ul className="space-y-2" aria-label="Otomasyon kuralları">
                {accountRules.map((r) => (
                  <li key={r.id} className="rounded-xl border border-[rgb(var(--color-border))] p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 font-semibold">{r.name || 'Adsız kural'}</p>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', r.enabled ? 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900' : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))] ring-[rgb(var(--color-border))]')}>
                        {r.enabled ? 'Açık' : 'Kapalı'}
                      </span>
                    </div>
                    {r.summary && <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">{r.summary}</p>}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Link href={`/admin/social/automation?account=${encodeURIComponent(a.id)}`} className={btn}>
                <Zap className="h-4 w-4" aria-hidden /> Kuralları düzenle ve önizle
              </Link>
              <Link href={`/admin/social/shares?account=${encodeURIComponent(a.id)}`} className={btn}>
                <History className="h-4 w-4" aria-hidden /> İş geçmişi
              </Link>
            </div>
            <p className="text-xs text-[rgb(var(--color-muted))]">Kuralı açma/kapatma ve düzenleme Otomasyon sayfasında yapılır; bu panel kural durumunu değiştirmez.</p>
          </>
        )}

        {tab === 'history' && <HistoryTab account={a} />}
      </div>
    </div>
  )
}

type LedgerRow = { newsId: string; accountId: string; platform: string; format: string; status: string; externalPostId: string | null; trigger: string | null; updatedAt: number }
const LEDGER_TEXT: Record<string, { text: string; tone: string }> = {
  succeeded: { text: 'Başarılı', tone: 'text-emerald-700 dark:text-emerald-300' },
  publishing: { text: 'Gönderiliyor', tone: 'text-blue-700 dark:text-blue-300' },
  failed: { text: 'Başarısız', tone: 'text-red-700 dark:text-red-300' },
  uncertain: { text: 'Belirsiz', tone: 'text-amber-700 dark:text-amber-300' },
}
const JOB_TEXT: Record<string, string> = { queued: 'Sırada', processing: 'İşleniyor', published: 'Yayımlandı', failed: 'Başarısız', cancelled: 'İptal edildi', uncertain: 'Sonuç belirsiz', skipped: 'Atlandı', awaiting_approval: 'Onay bekliyor' }
const TRIGGER_TEXT: Record<string, string> = {
  share: 'Manuel',
  composer: 'Manuel (panel)',
  after: 'Haber yayımlanınca',
  automation: 'Otomatik kural',
  cron: 'Eski otomasyon',
  studio: 'Reels stüdyosu',
  studio_media: 'Video Stüdyosu',
  studio_digest: 'Video Stüdyosu (özet)',
  tiktok_dialog: 'TikTok onayı',
  uncertain_republish: 'Belirsiz sonrası',
  force_reshare_bulk: 'Toplu yeniden paylaşım',
  api_social: 'API',
  api: 'API',
}

/** Lazily loaded on tab open, for THIS account only; a late answer for another account is dropped. */
function HistoryTab({ account }: { account: SocialAccountRow }) {
  const [data, setData] = useState<{ records: LedgerRow[]; jobs: AutomationJobPublic[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const guard = useRef(createLatestGuard())

  const load = useCallback(async () => {
    const t = guard.current.begin()
    setError(null)
    setData(null)
    const r = await socialApi<{ records: LedgerRow[]; jobs: AutomationJobPublic[] }>(`/api/social/history?accountId=${encodeURIComponent(account.id)}`)
    if (!guard.current.isCurrent(t)) return
    if (!r.ok) setError(r.error)
    else setData({ records: r.data.records.filter((x) => x.accountId === account.id), jobs: r.data.jobs.filter((j) => j.accountId === account.id) })
  }, [account.id])

  useEffect(() => {
    if (account.canPublish) void load()
    const g = guard.current
    return () => g.cancel()
  }, [account.canPublish, load])

  if (!account.canPublish) return <p className="rounded-xl bg-[rgb(var(--color-surface))] p-3 text-sm text-[rgb(var(--color-muted))]">Bu hesabın paylaşım geçmişini görme yetkiniz yok.</p>
  if (error)
    return (
      <div role="alert" className="space-y-2 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
        <p>Geçmiş yüklenemedi: {error}</p>
        <button type="button" onClick={() => void load()} className="underline">
          Tekrar dene
        </button>
      </div>
    )
  if (!data)
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-[rgb(var(--color-muted))]" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Geçmiş yükleniyor…
      </p>
    )

  const counts = { succeeded: 0, failed: 0, uncertain: 0 }
  for (const r of data.records) if (r.status in counts) counts[r.status as keyof typeof counts]++
  const openJobs = data.jobs.filter((j) => j.status !== 'published')

  return (
    <div className="space-y-3">
      <p className="text-xs text-[rgb(var(--color-muted))]">Sayılar bu hesabın son {data.records.length} yayın kaydından hesaplanır (sunucu hesap başına en yeni 30 kaydı döndürür).</p>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {(
          [
            ['succeeded', 'Başarılı'],
            ['failed', 'Başarısız'],
            ['uncertain', 'Belirsiz'],
          ] as const
        ).map(([k, label]) => (
          <div key={k} className="rounded-xl border border-[rgb(var(--color-border))] p-2">
            <dt className="text-xs text-[rgb(var(--color-muted))]">{label}</dt>
            <dd className={cn('text-lg font-bold', LEDGER_TEXT[k].tone)}>{counts[k]}</dd>
          </div>
        ))}
      </dl>
      {counts.uncertain > 0 && (
        <p className="rounded-xl bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          Belirsiz sonuçlar otomatik tekrarlanmaz; platformda kontrol edip Haber paylaşım masasındaki belirsiz sonuç panelinden onaylayın.
        </p>
      )}
      {data.records.length === 0 ? (
        <p className="rounded-xl bg-[rgb(var(--color-surface))] p-3 text-sm text-[rgb(var(--color-muted))]">Bu hesaptan henüz yayın kaydı yok.</p>
      ) : (
        <ul className="divide-y divide-[rgb(var(--color-border))] rounded-xl border border-[rgb(var(--color-border))] text-sm" aria-label="Son paylaşımlar">
          {data.records.slice(0, 30).map((r) => {
            const s = LEDGER_TEXT[r.status] ?? { text: r.status, tone: '' }
            return (
              <li key={`${r.newsId}:${r.format}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
                <span className={cn('font-semibold', s.tone)}>{s.text}</span>
                <span className="text-xs text-[rgb(var(--color-muted))]">
                  {r.format === 'story' ? 'Hikâye' : r.format === 'reel' ? 'Reels' : 'Gönderi'} · {TRIGGER_TEXT[r.trigger ?? ''] ?? r.trigger ?? '—'}
                </span>
                <span className="ml-auto text-xs text-[rgb(var(--color-muted))]">{r.updatedAt ? fmtDate(r.updatedAt) : '—'}</span>
                <span className="w-full truncate text-xs text-[rgb(var(--color-muted))]">Haber {r.newsId}</span>
              </li>
            )
          })}
        </ul>
      )}
      {openJobs.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-bold">Otomasyon işleri (son 7 gün, yayımlanmamış)</h3>
          <ul className="divide-y divide-[rgb(var(--color-border))] rounded-xl border border-[rgb(var(--color-border))] text-sm">
            {openJobs.slice(0, 20).map((j) => (
              <li key={j.id} className="px-3 py-2">
                <p className="truncate">{j.newsTitle}</p>
                <p className="text-xs text-[rgb(var(--color-muted))]">
                  {JOB_TEXT[j.status] ?? j.status} · {fmtDate(j.dueAt ?? j.updatedAt)}
                  {j.errorMessage ? ` · ${j.errorMessage}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        <Link href={`/admin/social/shares?account=${encodeURIComponent(account.id)}`} className={btn}>
          <ExternalLink className="h-4 w-4" aria-hidden /> Tüm ayrıntılar
        </Link>
        <button type="button" onClick={() => void load()} className={btn}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Yenile
        </button>
      </div>
    </div>
  )
}
