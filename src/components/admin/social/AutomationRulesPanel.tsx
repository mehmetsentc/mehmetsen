'use client'

/**
 * Hesap bazlı otomasyon kuralları — kural listesi, form, önizleme, devir, işler.
 *
 * - Yalnızca sunucu verisi gösterilir; örnek/mock satır yok.
 * - "Bağlı", "yayın izni doğrulandı" ve "otomasyon açık" ayrı durumlardır.
 * - Kural her zaman kapalı oluşturulur; açmak hedef hesap + koşul onayı ister.
 * - "Otomasyonu durdur" manuel paylaşımı kapatmaz; hesabı devre dışı bırakmak
 *   Hesaplar ekranında ayrı bir işlemdir.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Eye, Loader2, Pause, Play, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { auth } from '@/lib/firebase/auth'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { TURKISH_PROVINCES, getDistrictsForProvince } from '@/constants/cities'
import { cn } from '@/lib/utils'
import { supportedFormats, targetBlocker, TARGET_BLOCKER_TEXT, type PublishFormat } from '@/lib/social/accounts/capabilities'
import type { SocialAccountPublic, SocialAccountPlatform } from '@/lib/social/accounts/types'
import { summarizeRule } from '@/lib/social/automation/match'
import { RULE_LIMITS, type AutomationGeo, type AutomationRule, type AutomationRuleInput, type FeaturedKind, type FeaturedMode } from '@/lib/social/automation/types'
import type { AutomationJobPublic, AutomationJobStatus } from '@/lib/social/automation/jobs'

type RuleRow = AutomationRule & { summary: string }
type LegacyHandoff = { accountId: string; platform: SocialAccountPlatform; at: number; by: string }
type RulesResponse = {
  rules: RuleRow[]
  accounts: SocialAccountPublic[]
  legacyAccountIds: Record<SocialAccountPlatform, string | null>
  handoffs: Record<string, LegacyHandoff>
  counters: Record<string, { today: number; lastSentAt: number | null }>
  reconcile: { cursor: number | null; updatedAt: number | null }
}
type PreviewItem = { newsId: string; title: string; publishedAt: number | null; citySlug: string | null; categoryId: string | null; match: boolean; reasons: string[] }

const PLATFORM_SHORT: Record<SocialAccountPlatform, string> = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads' }
const FORMAT_TEXT: Record<PublishFormat, string> = { post: 'Gönderi', story: 'Hikâye' }
const MODE_OPTIONS: Array<{ value: FeaturedMode; label: string }> = [
  { value: 'categories_only', label: 'Seçilen kategoriler' },
  { value: 'featured_only', label: 'Yalnızca öne çıkanlar' },
  { value: 'categories_or_featured', label: 'Seçilen kategoriler VEYA öne çıkanlar' },
  { value: 'featured_in_categories', label: 'Seçilen kategorilerde YALNIZCA öne çıkanlar' },
]
const KIND_OPTIONS: Array<{ value: FeaturedKind; label: string }> = [
  { value: 'either', label: 'Ulusal veya il manşeti' },
  { value: 'national', label: 'Yalnızca nahaber.com manşeti' },
  { value: 'local', label: 'Yalnızca il sayfası manşeti' },
]
const JOB_STATUS_TEXT: Record<AutomationJobStatus, string> = {
  queued: 'Kuyrukta',
  processing: 'Gönderiliyor',
  published: 'Yayımlandı',
  failed: 'Başarısız',
  cancelled: 'İptal',
  uncertain: 'Belirsiz — platformda kontrol edin',
  skipped: 'Atlandı',
}
const JOB_CODE_TEXT: Record<string, string> = {
  rule_disabled: 'kural kapatıldı',
  no_matching_rule: 'eşleşen açık kural kalmadı',
  news_removed: 'haber silindi',
  news_unpublished: 'haber yayından kalktı',
  daily_limit: 'günlük sınır doldu',
  min_interval: 'paylaşım aralığı bekleniyor',
  quiet_hours: 'sessiz saat',
  stale: 'haber eskidi',
  token_invalid: 'erişim anahtarı reddedildi — yeniden bağlayın',
  rate_limited: 'platform hız sınırı',
  in_progress: 'aynı hesaba başka paylaşım sürüyor',
  already_published: 'zaten yayımlanmıştı (yeniden gönderilmedi)',
  needs_reauth: 'hesap yeniden bağlantı bekliyor',
  lease_expired: 'çalışan yarıda kaldı',
}

const CATEGORY_OPTIONS = DEFAULT_CATEGORIES.filter((c) => !['trend', 'tekrarlayan'].includes(c.id)).map((c) => ({ id: c.id, name: c.name, child: !!c.parentId }))

async function api<T>(path: string, init: RequestInit = {}): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    })
  } catch {
    return { ok: false, error: 'Ağ hatası — istek sunucuya ulaşmadı' }
  }
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    return { ok: false, error: `Sunucu yanıtı okunamadı (HTTP ${res.status})` }
  }
  if (!res.ok) return { ok: false, error: (body as { error?: string })?.error ?? `HTTP ${res.status}` }
  return { ok: true, data: body as T }
}

function emptyInput(accountId = ''): AutomationRuleInput {
  return {
    name: '',
    accountId,
    geo: { kind: 'provinces', citySlugs: [] },
    categoryIds: [],
    allCategories: false,
    featuredMode: 'categories_only',
    featuredKind: 'either',
    formats: ['post'],
    dailyLimit: RULE_LIMITS.dailyLimitDefault,
    minIntervalMinutes: RULE_LIMITS.minIntervalDefault,
    quietHours: null,
  }
}

function accountLabel(a: SocialAccountPublic | undefined, id: string): string {
  if (!a) return id
  return `${PLATFORM_SHORT[a.platform]} · ${a.username ? '@' + a.username : a.displayName}`
}

function accountHealth(a: SocialAccountPublic | undefined, formats: PublishFormat[]): { ok: boolean; text: string } {
  if (!a) return { ok: false, text: 'Hesap kaydı bulunamadı' }
  for (const f of formats) {
    const b = targetBlocker(a, f, Date.now())
    if (b) return { ok: false, text: TARGET_BLOCKER_TEXT[b] }
  }
  const expiry = a.tokenExpiresAt ? ` · erişim ${new Date(a.tokenExpiresAt).toLocaleDateString('tr-TR')} tarihine kadar` : a.tokenExpiryVerified ? ' · süre sınırı bildirilmedi (iptal edilebilir)' : ''
  return { ok: true, text: `Bağlı · yayın izni doğrulandı${expiry}` }
}

function fmtTime(ms: number | null): string {
  return ms ? new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
}

export function AutomationRulesPanel() {
  const [data, setData] = useState<RulesResponse | null>(null)
  const [jobs, setJobs] = useState<AutomationJobPublic[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string | null; input: AutomationRuleInput } | null>(null)
  const [confirmRule, setConfirmRule] = useState<RuleRow | null>(null)
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [r, j] = await Promise.all([
      api<RulesResponse>('/api/admin/social/automation/rules'),
      api<{ jobs: AutomationJobPublic[] }>('/api/admin/social/automation/jobs?days=7'),
    ])
    if (r.ok) {
      setData(r.data)
      setLoadError(null)
    } else setLoadError(r.error)
    if (j.ok) setJobs(j.data.jobs)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const accountsById = useMemo(() => new Map((data?.accounts ?? []).map((a) => [a.id, a])), [data])

  async function toggle(rule: RuleRow, enable: boolean) {
    setBusy(rule.id)
    const r = await api<{ cancelledJobs: number }>(`/api/admin/social/automation/rules/${rule.id}`, {
      method: 'PATCH',
      body: JSON.stringify(enable ? { action: 'enable', confirm: true } : { action: 'disable' }),
    })
    setBusy(null)
    if (!r.ok) return toast.error(r.error)
    toast.success(enable ? 'Otomasyon açıldı — yalnızca bundan sonra yayımlanan haberler paylaşılır' : `Otomasyon durduruldu${r.data.cancelledJobs ? ` · ${r.data.cancelledJobs} bekleyen iş iptal` : ''} (manuel paylaşım açık)`)
    setConfirmRule(null)
    void load()
  }

  async function remove(rule: RuleRow) {
    setBusy(rule.id)
    const r = await api(`/api/admin/social/automation/rules/${rule.id}`, { method: 'DELETE' })
    setBusy(null)
    if (!r.ok) return toast.error(r.error)
    toast.success('Kural silindi')
    void load()
  }

  async function handoff(accountId: string, on: boolean) {
    setBusy(accountId)
    const r = await api('/api/admin/social/automation/handoff', { method: 'POST', body: JSON.stringify({ accountId, on, confirm: true }) })
    setBusy(null)
    if (!r.ok) return toast.error(r.error)
    toast.success(on ? 'Eski otomatik yol bu hesap için durduruldu' : 'Eski otomatik yol bu hesap için yeniden etkin')
    void load()
  }

  const activeAccounts = (data?.accounts ?? []).filter((a) => a.connectionMethod !== 'legacy')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-3xl text-sm text-[rgb(var(--color-muted))]">
          Her kural tek bir bağlı hesaba bağlıdır. Kurallar <b>kapalı</b> oluşturulur; açıldığında yalnızca açıldıktan sonra yayımlanan
          haberler değerlendirilir (geriye dönük paylaşım yok). Aynı hesaba aynı haber, aynı biçimde bir kez gider — manuel paylaşım ve eski
          Onyeditivi yolu da aynı kilidi kullanır.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-sm font-semibold">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Yenile
          </button>
          <button
            type="button"
            disabled={activeAccounts.length === 0}
            onClick={() => setEditing({ id: null, input: emptyInput(activeAccounts[0]?.id ?? '') })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Yeni kural
          </button>
        </div>
      </div>

      {loadError ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{loadError}</p> : null}

      {data && data.reconcile.updatedAt === null ? (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Otomasyon çalışanı henüz hiç çalışmadı. Açık kural olsa bile paylaşım için <code>/api/cron/social-automation</code> ucunun zamanlanmış olması gerekir.
        </p>
      ) : data ? (
        <p className="text-xs text-[rgb(var(--color-muted))]">Çalışanın son değerlendirmesi: {fmtTime(data.reconcile.updatedAt)}</p>
      ) : null}

      {editing ? (
        <RuleForm
          key={editing.id ?? 'new'}
          initial={editing.input}
          ruleId={editing.id}
          accounts={activeAccounts}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      ) : null}

      <section className="space-y-3">
        <h3 className="text-base font-bold text-[rgb(var(--color-text))]">Kurallar</h3>
        {data && data.rules.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[rgb(var(--color-border))] p-4 text-sm text-[rgb(var(--color-muted))]">
            Henüz kural yok. {activeAccounts.length === 0 ? 'Önce Hesaplar ekranından resmî bağlantıyla bir hesap bağlayın.' : '«Yeni kural» ile başlayın.'}
          </p>
        ) : null}
        {(data?.rules ?? []).map((rule) => {
          const acc = accountsById.get(rule.accountId)
          const health = accountHealth(acc, rule.formats)
          const counter = data?.counters[rule.accountId]
          return (
            <div key={rule.id} className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[rgb(var(--color-text))]">{rule.name}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', rule.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700')}>
                      {rule.enabled ? 'Otomasyon açık' : 'Otomasyon kapalı'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[rgb(var(--color-text))]">
                    Hedef: <b>{accountLabel(acc, rule.accountId)}</b>
                    {rule.ownership.citySlug ? ` · sahip il: ${TURKISH_PROVINCES.find((p) => p.slug === rule.ownership.citySlug)?.name ?? rule.ownership.citySlug}` : ' · merkez'}
                  </p>
                  <p className={cn('mt-0.5 flex items-center gap-1 text-xs', health.ok ? 'text-emerald-700' : 'text-red-700')}>
                    {health.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />} {health.text}
                  </p>
                  <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">{rule.summary}</p>
                  <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
                    Bugün bu hesaba: {counter?.today ?? 0}/{rule.dailyLimit} · son otomatik gönderi: {fmtTime(counter?.lastSentAt ?? null)}
                    {rule.enabledAt ? ` · açılış: ${fmtTime(rule.enabledAt)}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {rule.enabled ? (
                    <button type="button" disabled={busy === rule.id} onClick={() => void toggle(rule, false)} className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm font-semibold">
                      <Pause className="h-4 w-4" /> Otomasyonu durdur
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy === rule.id || !health.ok}
                      title={health.ok ? undefined : health.text}
                      onClick={() => {
                        setConfirmChecked(false)
                        setConfirmRule(rule)
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
                    >
                      <Play className="h-4 w-4" /> Aç…
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing({ id: rule.id, input: { name: rule.name, accountId: rule.accountId, geo: rule.geo, categoryIds: rule.categoryIds, allCategories: rule.allCategories, featuredMode: rule.featuredMode, featuredKind: rule.featuredKind, formats: rule.formats, dailyLimit: rule.dailyLimit, minIntervalMinutes: rule.minIntervalMinutes, quietHours: rule.quietHours } })}
                    className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm font-semibold"
                  >
                    Düzenle
                  </button>
                  {!rule.enabled ? (
                    <button type="button" disabled={busy === rule.id} onClick={() => void remove(rule)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-700">
                      <Trash2 className="h-4 w-4" /> Sil
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {confirmRule ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-label="Otomasyonu aç">
          <div className="w-full max-w-lg space-y-3 rounded-2xl bg-[rgb(var(--color-card))] p-5 shadow-2xl">
            <h4 className="text-base font-bold text-[rgb(var(--color-text))]">Otomasyonu aç — onay</h4>
            <p className="text-sm text-[rgb(var(--color-text))]">
              Hedef hesap: <b>{accountLabel(accountsById.get(confirmRule.accountId), confirmRule.accountId)}</b>
            </p>
            <p className="text-sm text-[rgb(var(--color-muted))]">{confirmRule.summary}</p>
            <p className="text-sm text-[rgb(var(--color-muted))]">
              Açıldıktan sonra yayımlanan ve bu koşullara uyan haberler bu hesaba <b>gerçekten paylaşılır</b>. Önceki haberler paylaşılmaz.
            </p>
            {data?.legacyAccountIds[confirmRule.platform] === confirmRule.accountId && !data?.handoffs[confirmRule.accountId] ? (
              <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                Bu hesap eski Onyeditivi otomatik yolunun da hedefi. Ortak kilit aynı haberin iki kez gitmesini engeller; eski yolu durdurmak için aşağıdaki «Eski yol devri» bölümünü kullanın.
              </p>
            ) : null}
            <label className="flex items-start gap-2 text-sm text-[rgb(var(--color-text))]">
              <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} className="mt-1" />
              Hedef hesabı, koşulları ve biçimleri kontrol ettim.
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmRule(null)} className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-sm font-semibold">
                Vazgeç
              </button>
              <button type="button" disabled={!confirmChecked || busy === confirmRule.id} onClick={() => void toggle(confirmRule, true)} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
                Otomasyonu aç
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <LegacyHandoffSection data={data} busy={busy} onHandoff={handoff} accountsById={accountsById} />

      <section className="space-y-2">
        <h3 className="text-base font-bold text-[rgb(var(--color-text))]">Otomatik paylaşım işleri (son 7 gün)</h3>
        {jobs.length === 0 ? (
          <p className="text-sm text-[rgb(var(--color-muted))]">Kayıt yok.</p>
        ) : (
          <div className="divide-y divide-[rgb(var(--color-border))] overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
            {jobs.map((j) => (
              <div key={j.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-bold',
                    j.status === 'published' ? 'bg-emerald-100 text-emerald-800' : j.status === 'uncertain' ? 'bg-amber-100 text-amber-900' : j.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700',
                  )}
                >
                  {JOB_STATUS_TEXT[j.status]}
                </span>
                <span className="min-w-0 flex-1 truncate text-[rgb(var(--color-text))]">{j.newsTitle || j.newsId}</span>
                <span className="text-xs text-[rgb(var(--color-muted))]">
                  {accountLabel(accountsById.get(j.accountId), j.accountId)} · {FORMAT_TEXT[j.format]}
                  {j.errorCode && j.status !== 'published' ? ` · ${JOB_CODE_TEXT[j.errorCode] ?? j.errorCode}` : j.errorCode === 'already_published' ? ' · zaten yayımlanmıştı' : ''}
                  {j.dueAt && j.status === 'queued' ? ` · ${fmtTime(j.dueAt)}` : ''}
                </span>
                <span className="text-xs tabular-nums text-[rgb(var(--color-muted))]">{fmtTime(j.updatedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function LegacyHandoffSection({
  data,
  busy,
  onHandoff,
  accountsById,
}: {
  data: RulesResponse | null
  busy: string | null
  onHandoff: (accountId: string, on: boolean) => void
  accountsById: Map<string, SocialAccountPublic>
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  if (!data) return null
  const rows = (['facebook', 'instagram', 'threads'] as const)
    .map((p) => ({ platform: p, accountId: data.legacyAccountIds[p] }))
    .filter((r): r is { platform: SocialAccountPlatform; accountId: string } => !!r.accountId)
  if (rows.length === 0) return null
  return (
    <section className="space-y-2 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
      <h3 className="text-base font-bold text-[rgb(var(--color-text))]">Eski yol devri (Onyeditivi)</h3>
      <p className="text-sm text-[rgb(var(--color-muted))]">
        Eski otomatik yol (cron / yayın anı) devredilen hesaba artık paylaşım yapmaz; manuel paylaşım ve eski ayarlar/geçmiş korunur. Devir
        hesap başına açıkça yapılır ve geri alınabilir.
      </p>
      {rows.map((r) => {
        const acc = accountsById.get(r.accountId)
        const handed = !!data.handoffs[r.accountId]
        const rulesOn = data.rules.filter((x) => x.accountId === r.accountId && x.enabled).length
        const connected = !!acc && acc.connectionMethod !== 'legacy'
        return (
          <div key={r.platform} className="flex flex-wrap items-center gap-3 rounded-xl bg-[rgb(var(--color-card))] p-3 text-sm">
            <span className="font-semibold">{PLATFORM_SHORT[r.platform]}</span>
            <span className="text-[rgb(var(--color-muted))]">{connected ? accountLabel(acc, r.accountId) : 'resmî bağlantı yok'}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', handed ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700')}>
              {handed ? 'Devredildi — eski otomatik yol durdu' : 'Eski otomatik yol çalışıyor'}
            </span>
            <span className="text-xs text-[rgb(var(--color-muted))]">açık kural: {rulesOn}</span>
            <div className="ml-auto flex gap-2">
              {confirmId === r.accountId ? (
                <>
                  <span className="text-xs text-[rgb(var(--color-text))]">{handed ? 'Eski yolu yeniden etkinleştir?' : rulesOn === 0 ? 'Açık kural yok — bu hesaba otomatik paylaşım tamamen durur. Emin misiniz?' : 'Eski otomatik yolu bu hesap için durdur?'}</span>
                  <button type="button" disabled={busy === r.accountId} onClick={() => { setConfirmId(null); onHandoff(r.accountId, !handed) }} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">
                    Onayla
                  </button>
                  <button type="button" onClick={() => setConfirmId(null)} className="rounded-lg border px-3 py-1.5 text-xs">
                    Vazgeç
                  </button>
                </>
              ) : (
                <button type="button" disabled={!connected && !handed} onClick={() => setConfirmId(r.accountId)} className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
                  {handed ? 'Devri geri al' : 'Yeni otomasyona devret…'}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function RuleForm({
  initial,
  ruleId,
  accounts,
  onCancel,
  onSaved,
}: {
  initial: AutomationRuleInput
  ruleId: string | null
  accounts: SocialAccountPublic[]
  onCancel: () => void
  onSaved: () => void
}) {
  const [input, setInput] = useState<AutomationRuleInput>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ matched: number; scanned: number; items: PreviewItem[] } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [catQuery, setCatQuery] = useState('')
  const [provQuery, setProvQuery] = useState('')

  const account = accounts.find((a) => a.id === input.accountId)
  const formatsAllowed = account ? supportedFormats(account) : []
  const set = (patch: Partial<AutomationRuleInput>) => {
    setInput((p) => ({ ...p, ...patch }))
    setPreview(null)
  }
  const summary = useMemo(() => {
    try {
      return summarizeRule(input)
    } catch {
      return ''
    }
  }, [input])

  async function save() {
    setSaving(true)
    setError(null)
    const r = ruleId
      ? await api(`/api/admin/social/automation/rules/${ruleId}`, { method: 'PATCH', body: JSON.stringify({ rule: input }) })
      : await api('/api/admin/social/automation/rules', { method: 'POST', body: JSON.stringify(input) })
    setSaving(false)
    if (!r.ok) return setError(r.error)
    toast.success(ruleId ? 'Kural güncellendi' : 'Kural kapalı olarak kaydedildi')
    onSaved()
  }

  async function runPreview() {
    setPreviewing(true)
    setError(null)
    const r = await api<{ matched: number; scanned: number; items: PreviewItem[] }>('/api/admin/social/automation/preview', { method: 'POST', body: JSON.stringify(input) })
    setPreviewing(false)
    if (!r.ok) return setError(r.error)
    setPreview(r.data)
  }

  const geo = input.geo
  const setGeo = (g: AutomationGeo) => set({ geo: g })
  const provinces = TURKISH_PROVINCES.filter((p) => !provQuery || p.name.toLocaleLowerCase('tr').includes(provQuery.toLocaleLowerCase('tr')))
  const cats = CATEGORY_OPTIONS.filter((c) => !catQuery || c.name.toLocaleLowerCase('tr').includes(catQuery.toLocaleLowerCase('tr')))
  const input_ = 'rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-2.5 py-1.5 text-sm text-[rgb(var(--color-text))]'

  return (
    <div className="space-y-4 rounded-2xl border-2 border-[rgb(var(--color-brand))]/30 bg-[rgb(var(--color-card))] p-5 shadow-sm">
      <h3 className="text-base font-bold text-[rgb(var(--color-text))]">{ruleId ? 'Kuralı düzenle' : 'Yeni kural (kapalı kaydedilir)'}</h3>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-semibold">Kural adı</span>
          <input value={input.name} maxLength={RULE_LIMITS.nameMax} onChange={(e) => set({ name: e.target.value })} className={cn(input_, 'w-full')} placeholder="ör. Antalya yerel haberleri" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-semibold">Hedef hesap</span>
          <select value={input.accountId} disabled={!!ruleId} onChange={(e) => set({ accountId: e.target.value, formats: ['post'] })} className={cn(input_, 'w-full')}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {accountLabel(a, a.id)}
                {a.ownership.citySlug ? ` (${a.ownership.citySlug})` : ''}
              </option>
            ))}
          </select>
          {ruleId ? <span className="text-xs text-[rgb(var(--color-muted))]">Hedef hesap değiştirilemez — yeni kural oluşturun.</span> : null}
        </label>
      </div>

      <fieldset className="space-y-2 text-sm">
        <legend className="font-semibold">Konum</legend>
        <div className="flex flex-wrap gap-3">
          {([
            ['provinces', 'İller'],
            ['districts', 'İlçeler'],
            ['national', 'Ulusal haberler'],
            ['any', 'Tüm haberler (il ayrımı yok)'],
          ] as const).map(([k, label]) => (
            <label key={k} className="inline-flex items-center gap-1.5">
              <input
                type="radio"
                checked={geo.kind === k}
                onChange={() =>
                  setGeo(k === 'provinces' ? { kind: 'provinces', citySlugs: [] } : k === 'districts' ? { kind: 'districts', citySlug: account?.ownership.citySlug ?? 'antalya', districtSlugs: [] } : { kind: k })
                }
              />
              {label}
            </label>
          ))}
        </div>
        {geo.kind === 'national' ? <p className="text-xs text-[rgb(var(--color-muted))]">Ulusal = yerel ya da Kıbrıs kapsamlı olmayan haberler. «Tüm iller» anlamına gelmez.</p> : null}
        {geo.kind === 'provinces' ? (
          <div className="space-y-2">
            <input value={provQuery} onChange={(e) => setProvQuery(e.target.value)} placeholder="İl ara" className={input_} />
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-auto">
              {provinces.map((p) => {
                const on = geo.citySlugs.includes(p.slug)
                return (
                  <button
                    key={p.slug}
                    type="button"
                    onClick={() => setGeo({ kind: 'provinces', citySlugs: on ? geo.citySlugs.filter((s) => s !== p.slug) : [...geo.citySlugs, p.slug] })}
                    className={cn('rounded-full border px-2.5 py-1 text-xs', on ? 'border-emerald-600 bg-emerald-50 font-bold text-emerald-800' : 'border-[rgb(var(--color-border))]')}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
        {geo.kind === 'districts' ? (
          <div className="space-y-2">
            <select value={geo.citySlug} onChange={(e) => setGeo({ kind: 'districts', citySlug: e.target.value, districtSlugs: [] })} className={input_}>
              {TURKISH_PROVINCES.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-auto">
              {getDistrictsForProvince(geo.citySlug).map((d) => {
                const on = geo.districtSlugs.includes(d.slug)
                return (
                  <button
                    key={d.slug}
                    type="button"
                    onClick={() => setGeo({ ...geo, districtSlugs: on ? geo.districtSlugs.filter((s) => s !== d.slug) : [...geo.districtSlugs, d.slug] })}
                    className={cn('rounded-full border px-2.5 py-1 text-xs', on ? 'border-emerald-600 bg-emerald-50 font-bold text-emerald-800' : 'border-[rgb(var(--color-border))]')}
                  >
                    {d.name}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2 text-sm">
        <legend className="font-semibold">İçerik koşulu</legend>
        <div className="flex flex-wrap gap-3">
          <select value={input.featuredMode} onChange={(e) => set({ featuredMode: e.target.value as FeaturedMode, ...(e.target.value === 'featured_only' ? { categoryIds: [], allCategories: false } : {}) })} className={input_}>
            {MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {input.featuredMode !== 'categories_only' ? (
            <select value={input.featuredKind} onChange={(e) => set({ featuredKind: e.target.value as FeaturedKind })} className={input_}>
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        {input.featuredMode !== 'featured_only' ? (
          <div className="space-y-2">
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={input.allCategories} onChange={(e) => set({ allCategories: e.target.checked, categoryIds: [] })} />
              Tüm kategoriler (açıkça seçildi)
            </label>
            {!input.allCategories ? (
              <>
                <input value={catQuery} onChange={(e) => setCatQuery(e.target.value)} placeholder="Kategori ara (üst kategori alt kategorileri kapsar)" className={cn(input_, 'w-full')} />
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-auto">
                  {cats.map((c) => {
                    const on = input.categoryIds.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => set({ categoryIds: on ? input.categoryIds.filter((x) => x !== c.id) : [...input.categoryIds, c.id] })}
                        className={cn('rounded-full border px-2.5 py-1 text-xs', on ? 'border-emerald-600 bg-emerald-50 font-bold text-emerald-800' : 'border-[rgb(var(--color-border))]', !c.child && 'font-semibold')}
                      >
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      <div className="grid gap-3 md:grid-cols-4">
        <fieldset className="space-y-1 text-sm">
          <legend className="font-semibold">Biçim</legend>
          {(['post', 'story'] as const).map((f) => (
            <label key={f} className={cn('flex items-center gap-1.5', !formatsAllowed.includes(f) && 'opacity-50')}>
              <input
                type="checkbox"
                disabled={!formatsAllowed.includes(f)}
                checked={input.formats.includes(f)}
                onChange={(e) => set({ formats: e.target.checked ? [...input.formats, f] : input.formats.filter((x) => x !== f) })}
              />
              {FORMAT_TEXT[f]}
              {!formatsAllowed.includes(f) ? ' (bu hesapta yok)' : ''}
            </label>
          ))}
          <p className="text-xs text-[rgb(var(--color-muted))]">Reels / video: henüz yok.</p>
        </fieldset>
        <label className="space-y-1 text-sm">
          <span className="font-semibold">Günlük en fazla</span>
          <input type="number" min={RULE_LIMITS.dailyLimitMin} max={RULE_LIMITS.dailyLimitMax} value={input.dailyLimit} onChange={(e) => set({ dailyLimit: Number(e.target.value) })} className={cn(input_, 'w-full')} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-semibold">En az aralık (dk)</span>
          <input type="number" min={RULE_LIMITS.minIntervalMin} max={RULE_LIMITS.minIntervalMax} value={input.minIntervalMinutes} onChange={(e) => set({ minIntervalMinutes: Number(e.target.value) })} className={cn(input_, 'w-full')} />
        </label>
        <div className="space-y-1 text-sm">
          <label className="flex items-center gap-1.5 font-semibold">
            <input type="checkbox" checked={!!input.quietHours} onChange={(e) => set({ quietHours: e.target.checked ? { startHour: 0, endHour: 7 } : null })} />
            Sessiz saatler (TR)
          </label>
          {input.quietHours ? (
            <div className="flex items-center gap-1">
              <input type="number" min={0} max={23} value={input.quietHours.startHour} onChange={(e) => set({ quietHours: { ...input.quietHours!, startHour: Number(e.target.value) } })} className={cn(input_, 'w-16')} />
              <span>–</span>
              <input type="number" min={0} max={23} value={input.quietHours.endHour} onChange={(e) => set({ quietHours: { ...input.quietHours!, endHour: Number(e.target.value) } })} className={cn(input_, 'w-16')} />
            </div>
          ) : null}
        </div>
      </div>

      {summary ? (
        <p className="rounded-xl bg-[rgb(var(--color-surface))] p-3 text-sm text-[rgb(var(--color-text))]">
          <b>Özet:</b> {summary}
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-sm font-semibold">
          Vazgeç
        </button>
        <button type="button" disabled={previewing} onClick={() => void runPreview()} className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-sm font-semibold">
          {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Önizle (paylaşmaz)
        </button>
        <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
          {saving ? 'Kaydediliyor…' : 'Kaydet (kapalı)'}
        </button>
      </div>

      {preview ? (
        <div className="space-y-2">
          <p className="text-sm text-[rgb(var(--color-text))]">
            Son {preview.scanned} yayımlanmış haberden <b>{preview.matched}</b> tanesi bu kurala uyardı. Önizleme paylaşım yapmaz; kural açıldığında yalnızca sonradan yayımlananlar değerlendirilir.
          </p>
          <div className="max-h-80 divide-y divide-[rgb(var(--color-border))] overflow-auto rounded-xl border border-[rgb(var(--color-border))]">
            {preview.items.map((i) => (
              <div key={i.newsId} className="flex items-start gap-2 px-3 py-2 text-sm">
                <span className={cn('mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold', i.match ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600')}>{i.match ? 'Uyar' : 'Uymaz'}</span>
                <div className="min-w-0">
                  <p className="truncate text-[rgb(var(--color-text))]">{i.title}</p>
                  <p className="text-xs text-[rgb(var(--color-muted))]">
                    {fmtTime(i.publishedAt)} · {i.citySlug ?? '—'} · {i.categoryId ?? '—'} — {i.reasons.join(' · ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
