'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { PublisherStudioNav } from '@/components/publisher/studio/PublisherStudioNav'
import { auth } from '@/lib/firebase/auth'
import { ROUTES } from '@/constants/routes'
import type { PublisherRecord, PublisherMemberRole } from '@/types/publisher'

export function PublisherStudioShell({
  slug,
  publisher,
  children,
}: {
  slug: string
  publisher: PublisherRecord
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row lg:px-6">
      <PublisherStudioNav slug={slug} displayName={publisher.displayName} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  )
}

export function useStudioFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(Boolean(url))
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!url) {
      setLoading(false)
      setData(null)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const user = auth.currentUser
        if (!user) throw new Error('Giriş gerekli')
        const token = await user.getIdToken()
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Yüklenemedi')
        if (!cancelled) setData(body as T)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Hata')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [url, tick])

  return { data, loading, error, refetch: () => setTick((t) => t + 1) }
}

export function PublisherStudioPicker() {
  const router = useRouter()
  const { data, loading, error } = useStudioFetch<{ publishers: Array<PublisherRecord & { role: PublisherMemberRole }> }>(
    '/api/publisher-studio/mine'
  )

  useEffect(() => {
    if (!loading && data?.publishers.length === 1) {
      router.replace(ROUTES.PUBLISHER_STUDIO.PUBLISHER(data.publishers[0]!.slug))
    }
  }, [data, loading, router])

  if (loading) return <p className="p-6 text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</p>
  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-black">Publisher Studio</h1>
      <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">Yönetmek istediğiniz yayını seçin.</p>
      <ul className="mt-6 space-y-2">
        {(data?.publishers ?? []).map((p) => (
          <li key={p.id}>
            <Link
              href={ROUTES.PUBLISHER_STUDIO.PUBLISHER(p.slug)}
              className="block rounded-xl border border-[rgb(var(--color-border))] px-4 py-3 font-semibold hover:border-[rgb(var(--color-brand))]"
            >
              {p.displayName}
              <span className="ml-2 text-xs text-[rgb(var(--color-muted))]">{p.role}</span>
            </Link>
          </li>
        ))}
      </ul>
      {!data?.publishers.length ? (
        <p className="mt-4 text-sm text-[rgb(var(--color-muted))]">Henüz bir yayına üye değilsiniz.</p>
      ) : null}
    </div>
  )
}

export function StudioComingSoon({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[rgb(var(--color-border))] p-8 text-center">
      <h2 className="text-lg font-black">{title}</h2>
      <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">Bu bölüm yakında eklenecek.</p>
    </div>
  )
}

export async function studioAuthedFetch(url: string, init?: RequestInit) {
  const user = auth.currentUser
  if (!user) throw new Error('Giriş gerekli')
  const token = await user.getIdToken()
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || 'İstek başarısız')
  return body
}

export function saveProfile(publisherId: string, patch: Record<string, unknown>) {
  return studioAuthedFetch(`/api/publisher-studio/${publisherId}/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).then(() => toast.success('Profil güncellendi'))
}
