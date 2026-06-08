import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalDocument } from '@/components/settings/LegalDocument'
import { FEED_CONTENT_POLICY } from '@/constants/legal'
import { ROUTES } from '@/constants/routes'

export const metadata: Metadata = {
  title: 'İçerik Kuralları',
  description: 'NaHaber yasaklı içerik, bahis, müstehcen içerik ve yasadışı kullanım kuralları',
}

export default function FeedContentPolicyPage() {
  return (
    <div className="legal-hub mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-4">
        <Link href={ROUTES.FEED} className="text-sm font-medium text-red-600 hover:underline">
          ← Akışa dön
        </Link>
      </div>
      <LegalDocument document={FEED_CONTENT_POLICY} />
    </div>
  )
}
