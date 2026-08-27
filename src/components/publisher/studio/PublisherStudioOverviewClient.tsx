'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { PublisherStudioShell } from '@/components/publisher/studio/PublisherStudioShell'
import { ROUTES } from '@/constants/routes'
import { auth } from '@/lib/firebase/auth'
import type { PublisherRecord } from '@/types/publisher'
import type { PublisherSetupStatus } from '@/types/publisherRollout'

const EMPTY: PublisherSetupStatus = {
  profileComplete: false,
  hasLogoOrCover: false,
  hasPublishedNews: false,
  hasTeam: false,
  hasAdInventory: false,
  checklistDismissed: false,
}

function ProgressRow({
  label,
  done,
  href,
}: {
  label: string
  done: boolean
  href: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-sm hover:bg-[rgb(var(--color-surface))]"
    >
      <span>{label}</span>
      <span
        className={
          done
            ? 'font-semibold text-emerald-600 dark:text-emerald-400'
            : 'text-[rgb(var(--color-muted))]'
        }
      >
        {done ? 'Tamam' : 'Eksik'}
      </span>
    </Link>
  )
}

export function PublisherStudioOverviewClient({
  slug,
  publisher,
}: {
  slug: string
  publisher: PublisherRecord
}) {
  const [status, setStatus] = useState<PublisherSetupStatus>(EMPTY)
  const [showChecklist, setShowChecklist] = useState(false)

  const load = useCallback(async () => {
    const user = auth.currentUser
    if (!user) return
    const token = await user.getIdToken()
    const res = await fetch(`/api/publisher-studio/${publisher.id}/setup-status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const body = (await res.json()) as { status?: PublisherSetupStatus }
    if (body.status) {
      setStatus(body.status)
      const incomplete =
        !body.status.profileComplete ||
        !body.status.hasLogoOrCover ||
        !body.status.hasPublishedNews
      setShowChecklist(incomplete && !body.status.checklistDismissed)
    }
  }, [publisher.id])

  useEffect(() => {
    void load()
  }, [load])

  const dismiss = async () => {
    const user = auth.currentUser
    if (!user) return
    const token = await user.getIdToken()
    await fetch(`/api/publisher-studio/${publisher.id}/setup-status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dismiss: true }),
    })
    setShowChecklist(false)
  }

  return (
    <PublisherStudioShell slug={slug} publisher={publisher}>
      <h1 className="text-2xl font-black">Genel Bakış</h1>
      <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">
        {publisher.displayName} yayınını yönetin.
      </p>

      {showChecklist && (
        <section className="mt-6 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold">İlk kurulum</p>
              <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
                Kısa kontrol listesi — istediğiniz zaman atlayabilirsiniz.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void dismiss()}
              className="shrink-0 text-sm font-semibold text-[rgb(var(--color-muted))]"
            >
              Atla
            </button>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href={ROUTES.PUBLISHER_STUDIO.PROFILE(slug)} className="text-[rgb(var(--color-brand))]">
                Profil bilgilerini düzenle
              </Link>
            </li>
            <li>
              <Link href={ROUTES.PUBLISHER_STUDIO.PROFILE(slug)} className="text-[rgb(var(--color-brand))]">
                Logo / kapak ekle
              </Link>
            </li>
            <li>
              <Link href={ROUTES.PUBLISHER_STUDIO.ARTICLES(slug)} className="text-[rgb(var(--color-brand))]">
                Haberleri görüntüle veya yayınla
              </Link>
            </li>
            <li>
              <Link href={ROUTES.PUBLISHER_STUDIO.LAYOUT(slug)} className="text-[rgb(var(--color-brand))]">
                Sayfa düzenini ayarla
              </Link>
            </li>
            <li>
              <Link href={ROUTES.PUBLISHER_STUDIO.ADS(slug)} className="text-[rgb(var(--color-brand))]">
                İsteğe bağlı: reklam alanı ekle
              </Link>
            </li>
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
          Kurulum Durumu
        </h2>
        <div className="mt-3 space-y-2">
          <ProgressRow
            label="Profil"
            done={status.profileComplete}
            href={ROUTES.PUBLISHER_STUDIO.PROFILE(slug)}
          />
          <ProgressRow
            label="Haberler"
            done={status.hasPublishedNews}
            href={ROUTES.PUBLISHER_STUDIO.ARTICLES(slug)}
          />
          <ProgressRow
            label="Takım"
            done={status.hasTeam}
            href={ROUTES.PUBLISHER_STUDIO.TEAM(slug)}
          />
          <ProgressRow
            label="Reklam Alanları"
            done={status.hasAdInventory}
            href={ROUTES.PUBLISHER_STUDIO.ADS(slug)}
          />
        </div>
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link href={ROUTES.PUBLISHER_STUDIO.PROFILE(slug)} className="studio-card">
          Profil ayarları
        </Link>
        <Link href={ROUTES.PUBLISHER_STUDIO.LAYOUT(slug)} className="studio-card">
          Sayfa düzeni
        </Link>
        <Link href={ROUTES.PUBLISHER_STUDIO.ARTICLES(slug)} className="studio-card">
          Content Studio
        </Link>
        <Link href={ROUTES.PUBLISHER(publisher.slug)} className="studio-card" target="_blank">
          Public profili görüntüle
        </Link>
      </div>
    </PublisherStudioShell>
  )
}
