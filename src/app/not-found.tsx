import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-6xl font-bold text-brand-600">404</h1>
      <p className="text-gray-500">Aradığın sayfa bulunamadı.</p>
      <Link
        href="/"
        className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700"
      >
        Ana sayfaya dön
      </Link>
    </div>
  )
}
