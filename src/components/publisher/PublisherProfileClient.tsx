'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BadgeCheck, ExternalLink, Globe, MapPin } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { ROUTES } from '@/constants/routes'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import type { PublicPublisherRecord, PublisherArticleItem } from '@/types/publisher'
import { FollowButton } from '@/components/social/FollowButton'
import { isSocialGraphEnabledClient } from '@/lib/social/featureFlagClient'
import toast from 'react-hot-toast'

type ClaimUiStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'loading'

export function PublisherProfileClient({
  publisher,
  articles,
}: {
  publisher: PublicPublisherRecord
  articles: PublisherArticleItem[]
}) {
  const router = useRouter()
  const [claimOpen, setClaimOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [businessEmail, setBusinessEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [claimUi, setClaimUi] = useState<ClaimUiStatus>('loading')
  const [studioHref, setStudioHref] = useState<string | null>(null)

  const refreshClaimStatus = useCallback(async () => {
    const user = auth.currentUser
    if (!user) {
      setClaimUi('none')
      setStudioHref(null)
      return
    }
    try {
      const token = await user.getIdToken()
      const res = await fetch(`/api/publishers/${encodeURIComponent(publisher.slug)}/claim`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        setClaimUi('none')
        return
      }
      const body = (await res.json()) as {
        status?: ClaimUiStatus
        studioHref?: string | null
      }
      setClaimUi(body.status ?? 'none')
      setStudioHref(body.studioHref ?? null)
    } catch {
      setClaimUi('none')
    }
  }, [publisher.slug])

  useEffect(() => {
    void refreshClaimStatus()
  }, [refreshClaimStatus])

  const showClaimCta =
    publisher.status === 'UNCLAIMED' &&
    (publisher.verificationStatus === 'UNCLAIMED' ||
      publisher.verificationStatus === 'PENDING' ||
      publisher.verificationStatus === 'REJECTED')

  const submitClaim = async () => {
    const user = auth.currentUser
    if (!user) {
      router.push(`${ROUTES.LOGIN}?next=${encodeURIComponent(ROUTES.PUBLISHER(publisher.slug))}`)
      return
    }
    setSubmitting(true)
    try {
      const token = await user.getIdToken()
      const res = await fetch(`/api/publishers/${encodeURIComponent(publisher.slug)}/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: message.trim() || undefined,
          businessEmail: businessEmail.trim() || undefined,
        }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'Talep gönderilemedi')
      toast.success('Sahiplik talebiniz alındı. İnceleme sonrası bilgilendirileceksiniz.')
      setClaimOpen(false)
      setClaimUi('pending')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Talep gönderilemedi')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
            {publisher.logoUrl ? (
              <SafeNewsImage
                src={publisher.logoUrl}
                alt={publisher.displayName}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-black text-[rgb(var(--color-muted))]">
                {publisher.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-[rgb(var(--color-text))] sm:text-3xl">
                {publisher.displayName}
              </h1>
              {publisher.isVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                  Doğrulandı
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-[rgb(var(--color-muted))]">
              {(publisher.city || publisher.countryCode) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                  {[publisher.city, publisher.countryCode].filter(Boolean).join(', ')}
                </span>
              )}
              {publisher.websiteUrl && (
                <a
                  href={publisher.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-[rgb(var(--color-brand))]"
                >
                  <Globe className="h-4 w-4 shrink-0" aria-hidden />
                  Web sitesi
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <FollowButton publisherId={publisher.id} publisherSlug={publisher.slug} />
            </div>
            {publisher.description ? (
              <p className="mt-3 text-sm leading-relaxed text-[rgb(var(--color-text))]">
                {publisher.description}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {claimUi === 'pending' && (
        <section className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">İnceleniyor</p>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
            Sahiplik talebiniz incelemede. Aynı yayın için yeni talep oluşturulamaz.
          </p>
        </section>
      )}

      {claimUi === 'approved' && studioHref && (
        <section className="mb-8 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">Onaylandı</p>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
            Yayıncı hesabınız doğrulandı. Studio’dan profil ve içerik yönetimi yapabilirsiniz.
          </p>
          <Link
            href={studioHref}
            className="mt-3 inline-flex rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2 text-sm font-bold text-white"
          >
            Publisher Studio&apos;ya Git
          </Link>
        </section>
      )}

      {claimUi === 'rejected' && showClaimCta && (
        <section className="mb-8 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">Reddedildi</p>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
            Önceki talebiniz reddedildi. Gerekirse yeniden başvurabilirsiniz.
          </p>
        </section>
      )}

      {showClaimCta && claimUi !== 'pending' && claimUi !== 'approved' && (
        <section className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          {!claimOpen ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-[rgb(var(--color-text))]">
                Bu yayın kuruluşunu yönetiyor musunuz?
              </p>
              <button
                type="button"
                onClick={() => {
                  if (!auth.currentUser) {
                    router.push(
                      `${ROUTES.LOGIN}?next=${encodeURIComponent(ROUTES.PUBLISHER(publisher.slug))}`
                    )
                    return
                  }
                  setClaimOpen(true)
                }}
                className="shrink-0 rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2 text-sm font-bold text-white"
              >
                Yayıncı Profilini Doğrula
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold">Yayıncı doğrulama talebi</p>
              <input
                type="email"
                placeholder="Kurumsal e-posta (isteğe bağlı)"
                value={businessEmail}
                onChange={(e) => setBusinessEmail(e.target.value)}
                className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Kısa açıklama (isteğe bağlı)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void submitClaim()}
                  className="rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {submitting ? 'Gönderiliyor…' : 'Talebi gönder'}
                </button>
                <button
                  type="button"
                  onClick={() => setClaimOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-[rgb(var(--color-muted))]"
                >
                  İptal
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-4 text-lg font-black text-[rgb(var(--color-text))]">Haberler</h2>
        {articles.length === 0 ? (
          <p className="text-sm text-[rgb(var(--color-muted))]">Henüz yayınlanmış haber bulunamadı.</p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--color-border))]">
            {articles.map((article) => (
              <li key={article.id}>
                <Link
                  href={ROUTES.NEWS_DETAIL(article.slug)}
                  className={cn(
                    'flex gap-3 py-4 transition-colors hover:bg-[rgb(var(--color-surface))]/50 -mx-2 px-2 rounded-lg'
                  )}
                >
                  {article.thumbnailUrl ? (
                    <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-[rgb(var(--color-surface))]">
                      <SafeNewsImage
                        src={article.thumbnailUrl}
                        alt=""
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0">
                    <p className="font-semibold text-[rgb(var(--color-text))] line-clamp-2">
                      {article.title}
                    </p>
                    {article.summary ? (
                      <p className="mt-1 text-sm text-[rgb(var(--color-muted))] line-clamp-2">
                        {article.summary}
                      </p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
