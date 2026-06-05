'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-semibold text-gray-800">Bir şeyler ters gitti</h2>
      <p className="text-sm text-gray-500">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
      >
        Tekrar dene
      </button>
    </div>
  )
}
