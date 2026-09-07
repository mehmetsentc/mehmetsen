'use client'

import { useState } from 'react'
import { formatPublicSourceLabel } from '@/lib/postUtils'
import { AnimatePresence, motion } from 'framer-motion'
import { BadgeCheck, ExternalLink, Info, ShieldCheck, X } from 'lucide-react'
import type { Post } from '@/types/post'
import type { CanonicalSourceRef } from '@/services/editorial/canonicalSourceProvenance'

interface ArticleSourceBadgeProps {
  post: Post
}

/**
 * ArticleSourceBadge — F2 (+ P16.2B multi-source bridge)
 *
 * "Kaynak doğrulama" rozeti. NaHaber editöryal sürecinde kaynak doğrulanmış,
 * AI fact-checker'dan geçmiş haberler için verifikasyon işareti gösterir.
 *
 * P16.2B: `post.sources` doluysa (2+ gerçek, deduped kaynak — mevcut
 * news_clusters/cluster_memberships lineage'ından, read-only) ANA KAYNAK +
 * DESTEKLEYİCİ KAYNAKLAR listesi gösterilir. `post.sources` yoksa ya da
 * tek kaynaklıysa mevcut sade tek-kaynak görünümü AYNEN korunur — bu bir
 * fallback'tir, hata değildir (legacy/Firestore-migrated/cluster'sız haberler
 * için beklenen davranış).
 *
 * Kaynağın burada görünmesi hiçbir zaman "rights cleared" anlamına gelmez;
 * bu bileşen rightsStatus/rightsBasis/publicationAuthority'e dokunmaz.
 */
export function ArticleSourceBadge({ post }: ArticleSourceBadgeProps) {
  const [open, setOpen] = useState(false)
  const publicSource = formatPublicSourceLabel(post.source)

  // 2+ gerçek kaynak varsa çoklu-kaynak görünümüne geç. Tek kaynak (veya
  // provenance bulunamadıysa) mevcut sade davranış korunur (Task 3 fallback).
  const multiSources: CanonicalSourceRef[] | null =
    post.sources && post.sources.length >= 2 ? post.sources : null

  const primarySource = multiSources
    ? multiSources.find((s) => s.role === 'PRIMARY') ?? multiSources[0]
    : null
  const supportingSources = multiSources
    ? multiSources.filter((s) => s !== primarySource)
    : []

  // Heuristik: NaHaber kendi editörleri tarafından üretilmişse "doğrulanmış"
  // sayılır. RSS-only haberlerde "kaynak: X" şeklinde nötr rozet.
  const isVerified = Boolean(
    post.editorType ||
      (post.confidenceScore && post.confidenceScore >= 0.7) ||
      post.source === 'nahaber'
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Kaynak bilgisi"
        className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle px-3 py-1 text-xs font-semibold text-text-secondary ring-1 ring-border transition-colors hover:bg-bg-muted"
      >
        {multiSources ? (
          <>
            <Info className="h-3.5 w-3.5" />
            Kaynaklar ({multiSources.length})
          </>
        ) : isVerified ? (
          <>
            <BadgeCheck className="h-3.5 w-3.5 text-info" />
            Kaynak doğrulandı
          </>
        ) : (
          <>
            <Info className="h-3.5 w-3.5" />
            Kaynak: {publicSource || 'haber kaynağı'}
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-bg-card shadow-2xl"
            >
              <header className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-info" />
                  <h3 className="text-base font-bold tracking-tight">Kaynak Bilgisi</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Kapat"
                  className="rounded-full p-1.5 text-text-tertiary hover:bg-bg-subtle"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>
              <div className="space-y-4 px-5 py-5">
                {multiSources ? (
                  <>
                    {primarySource ? (
                      <Row label="Ana Kaynak" value={<SourceLine source={primarySource} />} />
                    ) : null}
                    {supportingSources.length > 0 ? (
                      <div className="space-y-2">
                        <span className="block text-2xs font-bold uppercase tracking-widest text-text-tertiary">
                          Destekleyici Kaynaklar
                        </span>
                        <ul className="space-y-2">
                          {supportingSources.map((s, i) => (
                            <li key={`${s.name}-${i}`} className="text-sm">
                              <SourceLine source={s} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Row label="Yayın Kaynağı" value={publicSource || 'Belirtilmemiş'} />
                    {post.sourceUrl ? (
                      <Row
                        label="Orijinal Bağlantı"
                        value={
                          <a
                            href={post.sourceUrl}
                            target="_blank"
                            rel="noopener nofollow noreferrer"
                            className="inline-flex items-center gap-1 truncate text-info hover:underline"
                          >
                            {trimUrl(post.sourceUrl)}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        }
                      />
                    ) : null}
                  </>
                )}
                {post.editorType ? (
                  <Row label="AI Editör" value={post.editorType} />
                ) : null}
                {typeof post.confidenceScore === 'number' ? (
                  <Row
                    label="Güven Skoru"
                    value={`${Math.round(post.confidenceScore * 100)}%`}
                  />
                ) : null}
                {post.publishedAt ? (
                  <Row label="Yayınlanma" value={new Date(post.publishedAt).toLocaleString('tr-TR')} />
                ) : null}
                {post.updatedAt && post.updatedAt !== post.publishedAt ? (
                  <Row label="Son güncelleme" value={new Date(post.updatedAt).toLocaleString('tr-TR')} />
                ) : null}
                <p className="rounded-xl bg-bg-subtle px-4 py-3 text-xs leading-relaxed text-text-tertiary">
                  NaHaber editöryal süreci, haberlerin doğruluğu için kaynak
                  doğrulama, AI fact-checker analizi ve insan editör onayını
                  birlikte kullanır.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}

function SourceLine({ source }: { source: CanonicalSourceRef }) {
  if (source.url) {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noopener nofollow noreferrer"
        className="inline-flex items-center gap-1 truncate font-medium text-info hover:underline"
      >
        {source.name}
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </a>
    )
  }
  return <span className="font-medium text-text-primary">{source.name}</span>
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <span className="w-32 shrink-0 text-2xs font-bold uppercase tracking-widest text-text-tertiary">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{value}</span>
    </div>
  )
}

function trimUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname : '')
  } catch {
    return url
  }
}
