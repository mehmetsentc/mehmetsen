import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Ana Akış' }

export default function FeedPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Ana Akış</h1>
      <p className="text-gray-500">Haberler burada görünecek — Aşama 3&apos;te kodlanacak.</p>
    </div>
  )
}
