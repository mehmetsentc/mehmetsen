import type { Metadata } from 'next'

export const revalidate = 60

export async function generateMetadata(): Promise<Metadata> {
  const { nationalHomeMetadata } = await import('@/components/home/NationalHomePage')
  return nationalHomeMetadata()
}

/**
 * National homepage at `/`, under `(main)` so soft-nav into
 * `/haber/[slug]` stays inside the same layout that owns `@modal` Article
 * Lift. City hosts are rewritten to `/city-site` before this segment runs;
 * city chrome and city metadata live there.
 */
export default async function Home() {
  const { NationalHomePage } = await import('@/components/home/NationalHomePage')
  return <NationalHomePage />
}
