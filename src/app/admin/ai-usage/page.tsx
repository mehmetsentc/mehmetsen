'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import type { AiUsageAggregate, AiUsageRange } from '@/lib/ai/usage/aggregate'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString('tr-TR')
}

function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString('tr-TR', { maximumFractionDigits: digits })
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${(n * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`
}

type UsageResponse = AiUsageAggregate & {
  pricingConfigured?: boolean
  telemetryEnabled?: boolean
  deepseekTokenWarningThreshold?: number | null
  error?: string
}

export default function AiUsagePage() {
  const [range, setRange] = useState<AiUsageRange>('today')
  const [data, setData] = useState<UsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/ai-usage?range=${range}`, { headers: await authHeaders() })
      const body = (await res.json()) as UsageResponse
      if (!res.ok) throw new Error(body.error || 'Yüklenemedi')
      setData(body)
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    void load()
  }, [load])

  const costHint = data?.pricingConfigured
    ? 'DeepSeek faturası ile birebir aynı olmayabilir'
    : 'Fiyat env tanımlı değil — token ölçümü çalışır'

  const deepseekRow = data?.providers?.find((p) => p.provider === 'deepseek')
  const groqRow = data?.providers?.find((p) => p.provider === 'groq')
  const warningThreshold = data?.deepseekTokenWarningThreshold ?? null
  const deepseekTokens = deepseekRow?.total ?? 0
  const warningExceeded =
    warningThreshold != null && deepseekTokens >= warningThreshold

  return (
    <AdminOsPageShell
      title="AI Maliyet"
      subtitle="Tahmini API maliyeti — DeepSeek provider billing ile aynı olduğu iddia edilmez"
      actions={
        <div className="flex gap-2">
          {(['today', '7d', '30d'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase',
                range === key
                  ? 'border-[rgb(var(--color-text))] bg-[rgb(var(--color-text))] text-[rgb(var(--color-bg))]'
                  : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]'
              )}
            >
              {key === 'today' ? 'Bugün' : key}
            </button>
          ))}
        </div>
      }
    >
      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <AdminOsMetricGrid
        items={[
          { label: 'İstekler', value: loading ? '…' : fmtInt(data?.requests), hint: data?.truncated ? 'Kırılım örneklem' : undefined },
          { label: 'Input Token', value: loading ? '…' : fmtInt(data?.inputTokens) },
          { label: 'Output Token', value: loading ? '…' : fmtInt(data?.outputTokens) },
          { label: 'Toplam Token', value: loading ? '…' : fmtInt(data?.totalTokens) },
          { label: 'Cache Hit Token', value: loading ? '…' : fmtInt(data?.cacheHitTokens) },
          { label: 'Cache Hit Oranı', value: loading ? '…' : fmtPct(data?.cacheHitRate) },
          { label: 'Tahmini API Maliyeti', value: loading ? '…' : fmtUsd(data?.estimatedCostUsd), hint: costHint, tone: 'ai' },
          { label: 'Hatalar', value: loading ? '…' : fmtInt(data?.failures), tone: (data?.failures ?? 0) > 0 ? 'warn' : 'ok' },
          { label: 'Retry', value: loading ? '…' : fmtInt(data?.retries) },
          { label: 'Usage Coverage', value: loading ? '…' : fmtPct(data?.usageCoverage), hint: 'Token alanlı event / tüm event' },
          {
            label: 'DeepSeek Token',
            value: loading ? '…' : fmtInt(deepseekRow?.total),
            hint:
              warningThreshold == null
                ? 'Bugünkü DeepSeek kullanımı (soft uyarı eşiği tanımlı değil)'
                : warningExceeded
                  ? `Uyarı eşiği aşıldı (${fmtInt(warningThreshold)}) — üretim durmaz`
                  : `Eşik: ${fmtInt(warningThreshold)} (üretim durmaz)`,
            tone: warningExceeded ? 'warn' : 'ok',
          },
          { label: 'Groq Token', value: loading ? '…' : fmtInt(groqRow?.total), hint: 'Classifier canary' },
          { label: 'Gemini Token', value: loading ? '…' : fmtInt(data?.providers?.find((p) => p.provider === 'gemini')?.total) },
          { label: 'OpenRouter Token', value: loading ? '…' : fmtInt(data?.providers?.find((p) => p.provider === 'openrouter')?.total) },
        ]}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <KpiCard
          title="AI çağrı / yayınlanan haber"
          value={
            data?.perPublished.available ? fmtNum(data.perPublished.calls, 2) : 'Yeterli attribution verisi yok'
          }
        />
        <KpiCard
          title="Token / yayınlanan haber"
          value={
            data?.perPublished.available ? fmtInt(data.perPublished.tokens) : 'Yeterli attribution verisi yok'
          }
        />
        <KpiCard
          title="Tahmini maliyet / yayınlanan haber"
          value={
            data?.perPublished.available
              ? fmtUsd(data.perPublished.estimatedCostUsd ?? null)
              : 'Yeterli attribution verisi yok'
          }
        />
      </div>

      {data?.tokenTelemetryBeganAt ? (
        <p className="text-xs text-[rgb(var(--color-muted))]">
          Token telemetry began at:{' '}
          {new Date(data.tokenTelemetryBeganAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}
          {data.truncated
            ? ` · Firestore taraması ${fmtInt(data.scanned)} event ile sınırlandı (istek sayısı count query).`
            : ''}
        </p>
      ) : (
        <p className="text-xs text-[rgb(var(--color-muted))]">
          Bu aralıkta token alanlı event yok. Eski aiUsageEvents kayıtları uydurulmaz.
        </p>
      )}

      <Section title="Provider Tasarruf Özeti">
        <p className="mb-3 text-xs text-[rgb(var(--color-muted))]">
          Tahmini — provider faturası ile birebir aynı olduğu iddia edilmez
        </p>
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between">
            <span>Cheap-provider başarılı istek</span>
            <span className="tabular-nums">{loading ? '…' : fmtInt(data?.savings?.cheapSuccessRequests)}</span>
          </li>
          <li className="flex justify-between">
            <span>Tahmini DeepSeek çağrısı kaçınıldı</span>
            <span className="tabular-nums">{loading ? '…' : fmtInt(data?.savings?.estimatedDeepSeekCallsAvoided)}</span>
          </li>
          <li className="flex justify-between">
            <span>DeepSeek fallback çağrıları</span>
            <span className="tabular-nums">{loading ? '…' : fmtInt(data?.savings?.deepseekFallbackRequests)}</span>
          </li>
          <li className="flex justify-between">
            <span>Cheap-provider başarı oranı</span>
            <span className="tabular-nums">{loading ? '…' : fmtPct(data?.savings?.cheapSuccessRate)}</span>
          </li>
          <li className="flex justify-between">
            <span>Fallback oranı</span>
            <span className="tabular-nums">{loading ? '…' : fmtPct(data?.savings?.fallbackRate)}</span>
          </li>
          <li className="flex justify-between">
            <span>Tahmini tasarruf (DeepSeek fiyat env varsa)</span>
            <span className="tabular-nums">{loading ? '…' : fmtUsd(data?.savings?.estimatedSavingsUsd)}</span>
          </li>
        </ul>
      </Section>

      <Section title="En Fazla Token Kullanan Ajanlar">
        {(data?.topTokenAgents.length ?? 0) === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-2 text-sm">
            {data!.topTokenAgents.map((row) => (
              <li key={row.agent} className="flex justify-between">
                <span className="font-medium">{row.agent}</span>
                <span className="tabular-nums admin-meta">
                  {fmtInt(row.totalTokens)} token · {fmtInt(row.requests)} istek
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="En Pahalı Operasyonlar">
        {(data?.topCostOperations.length ?? 0) === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-2 text-sm">
            {data!.topCostOperations.map((row) => (
              <li key={row.operation} className="flex justify-between">
                <span className="font-medium">{row.operation}</span>
                <span className="tabular-nums admin-meta">
                  {fmtUsd(row.estimatedCostUsd)} · {fmtInt(row.totalTokens)} token
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Table
        title="Ajanlar"
        headers={['Agent', 'Requests', 'Input', 'Output', 'Total', 'Retry', 'Error', 'Est. Cost']}
        rows={(data?.agents ?? []).map((r) => [
          r.agent,
          fmtInt(r.requests),
          fmtInt(r.input),
          fmtInt(r.output),
          fmtInt(r.total),
          fmtInt(r.retry),
          fmtInt(r.error),
          fmtUsd(r.estimatedCostUsd),
        ])}
      />

      <Table
        title="Sağlayıcılar"
        headers={['Provider', 'Requests', 'Input', 'Output', 'Total', 'Error']}
        rows={(data?.providers ?? []).map((r) => [
          r.provider,
          fmtInt(r.requests),
          fmtInt(r.input),
          fmtInt(r.output),
          fmtInt(r.total),
          fmtInt(r.error),
        ])}
      />

      <Table
        title="Modeller"
        headers={['Provider', 'Model', 'Requests', 'Input', 'Output', 'Cache Hit', 'Cost']}
        rows={(data?.models ?? []).map((r) => [
          r.provider,
          r.model,
          fmtInt(r.requests),
          fmtInt(r.input),
          fmtInt(r.output),
          fmtInt(r.cacheHit),
          fmtUsd(r.estimatedCostUsd),
        ])}
      />

      <Table
        title="Operasyonlar"
        headers={['Operation', 'Requests', 'Avg Input', 'Avg Output', 'Avg Latency', 'Error Rate', 'Cost']}
        rows={(data?.operations ?? []).map((r) => [
          r.operation,
          fmtInt(r.requests),
          fmtNum(r.avgInput, 0),
          fmtNum(r.avgOutput, 0),
          r.avgLatencyMs == null ? '—' : `${fmtNum(r.avgLatencyMs, 0)} ms`,
          fmtPct(r.errorRate),
          fmtUsd(r.estimatedCostUsd),
        ])}
      />

      <Table
        title="Retry"
        headers={['Agent', 'First Attempts', 'Retries', 'Retry Rate']}
        rows={(data?.retriesByAgent ?? []).map((r) => [
          r.agent,
          fmtInt(r.firstAttempts),
          fmtInt(r.retries),
          fmtPct(r.retryRate),
        ])}
      />

      <Table
        title="Günlük trend (Europe/Istanbul)"
        headers={['Tarih', 'İstek', 'Token', 'Tahmini maliyet']}
        rows={(data?.daily ?? []).map((r) => [r.date, fmtInt(r.requests), fmtInt(r.tokens), fmtUsd(r.estimatedCostUsd)])}
      />

      <Table
        title="Repeated Input Calls"
        headers={['inputHash', 'Operation', 'Calls']}
        rows={(data?.repeatedInputs ?? []).map((r) => [r.inputHash.slice(0, 16) + '…', r.operation, fmtInt(r.calls)])}
      />
    </AdminOsPageShell>
  )
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[rgb(var(--color-muted))]">{title}</p>
      <p className="mt-1 text-sm font-semibold text-[rgb(var(--color-text))]">{value}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Empty() {
  return <p className="text-sm text-[rgb(var(--color-muted))]">Bu aralıkta henüz telemetry yok.</p>
}

function Table({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
      <h2 className="border-b border-[rgb(var(--color-border))] px-4 py-3 text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <div className="px-4 py-6">
          <Empty />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--color-border))] text-[11px] uppercase text-[rgb(var(--color-muted))]">
                {headers.map((h) => (
                  <th key={h} className="px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--color-border))]">
              {rows.map((row, i) => (
                <tr key={`${title}-${i}`}>
                  {row.map((cell, j) => (
                    <td key={j} className={cn('px-4 py-3', j > 0 && 'tabular-nums')}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
