'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { auth } from '@/lib/firebase/auth'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function fmt(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString('tr-TR')
}

interface ArticleRow {
  id: string
  sourceId: string
  title: string | null
  countryCode: string | null
  publishedAt: string | Date | null
  wordCount: number | null
  extractionMethod: string | null
  extractionConfidence: number | null
  canonicalUrl: string | null
  isExactDuplicate: boolean
}

interface ArticleDetail extends ArticleRow {
  description: string | null
  articleBodyText: string | null
  author: string | null
  paragraphCount: number | null
  charCount: number | null
  mainImageUrl: string | null
  originalUrl: string
}

export default function CrawlerArticlesPage() {
  const [rows, setRows] = useState<ArticleRow[]>([])
  const [detail, setDetail] = useState<ArticleDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/admin/crawler/articles', { headers: await authHeaders() })
      const body = (await res.json()) as { articles?: ArticleRow[]; error?: string }
      if (!res.ok) throw new Error(body.error || 'Yüklenemedi')
      setRows(body.articles || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function openDetail(id: string) {
    const res = await fetch(`/api/admin/crawler/articles?id=${encodeURIComponent(id)}`, {
      headers: await authHeaders(),
    })
    const body = (await res.json()) as { article?: ArticleDetail; error?: string }
    if (!res.ok) {
      setError(body.error || 'Detay yok')
      return
    }
    setDetail(body.article || null)
  }

  return (
    <AdminOsPageShell title="Crawler Articles" subtitle="Ham extraction. AI yok. Production news değil.">
      <CrawlerSubnav />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--color-border))]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[rgb(var(--color-surface))] text-[11px] uppercase tracking-wide text-[rgb(var(--color-muted))]">
            <tr>
              <th className="px-3 py-2">Başlık</th>
              <th className="px-3 py-2">Kaynak</th>
              <th className="px-3 py-2">Ülke</th>
              <th className="px-3 py-2">Tarih</th>
              <th className="px-3 py-2">Kelime</th>
              <th className="px-3 py-2">Yöntem</th>
              <th className="px-3 py-2">Güven</th>
              <th className="px-3 py-2">Durum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[rgb(var(--color-border))]">
                <td className="px-3 py-2">
                  <button type="button" className="text-left font-medium underline" onClick={() => void openDetail(row.id)}>
                    {row.title || '(başlıksız)'}
                  </button>
                </td>
                <td className="px-3 py-2 text-[rgb(var(--color-muted))]">{row.sourceId.slice(0, 12)}</td>
                <td className="px-3 py-2">{row.countryCode || '—'}</td>
                <td className="px-3 py-2">{row.publishedAt ? new Date(row.publishedAt).toLocaleString('tr-TR') : '—'}</td>
                <td className="px-3 py-2">{fmt(row.wordCount ?? undefined)}</td>
                <td className="px-3 py-2">{row.extractionMethod || '—'}</td>
                <td className="px-3 py-2">
                  {row.extractionConfidence != null ? `${Math.round(row.extractionConfidence * 100)}%` : '—'}
                </td>
                <td className="px-3 py-2">{row.isExactDuplicate ? 'duplicate' : 'stored'}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td className="px-3 py-6 text-[rgb(var(--color-muted))]" colSpan={8}>
                  Kayıt yok. Crawler flag kapalıyken tick çalışmaz; Test Source kullanın.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {detail ? (
        <div className="rounded-2xl border border-[rgb(var(--color-border))] p-4 text-sm">
          <div className="mb-2 font-semibold">{detail.title}</div>
          <div className="text-[rgb(var(--color-muted))]">
            {detail.extractionMethod} · {fmt(detail.wordCount ?? undefined)} kelime · {fmt(detail.paragraphCount ?? undefined)} paragraf
          </div>
          <p className="mt-2">{detail.description}</p>
          <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[rgb(var(--color-muted))]">
            {(detail.articleBodyText || '').slice(0, 1200)}
            {(detail.articleBodyText || '').length > 1200 ? '…' : ''}
          </p>
          <button type="button" className="mt-2 text-xs underline" onClick={() => setDetail(null)}>
            Kapat
          </button>
        </div>
      ) : null}
    </AdminOsPageShell>
  )
}
