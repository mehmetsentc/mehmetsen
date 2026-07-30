'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { AdSlotProvider } from '@/context/AdSlotContext'
import { DesktopLocalNewsPage } from '@/components/home/desktop/DesktopLocalNewsPage'
import { LocalLocationSetupSheet } from '@/components/local/LocalLocationSetupSheet'
import { LocalNewsMobile } from '@/components/local/LocalNewsMobile'
import { useScrollHeaderConfig } from '@/context/ScrollHeaderContext'
import { useLocalNewsPage } from '@/hooks/useLocalNewsPage'
import { usePlatformLayout } from '@/hooks/usePlatformLayout'
import { TURKISH_PROVINCES } from '@/constants/cities'
import type { NewsItem } from '@/types/newsItem'

interface LocalNewsClientProps {
  breakingItems?: NewsItem[]
}

function LocalScrollHeaderConfig({ breakingItems }: { breakingItems: NewsItem[] }) {
  useScrollHeaderConfig({
    breakingItems,
    showBreaking: breakingItems.length > 0,
  })
  return null
}

function LocalNewsBody({ breakingItems = [] }: LocalNewsClientProps) {
  const { isDesktop } = usePlatformLayout()
  const state = useLocalNewsPage()
  const searchParams = useSearchParams()

  useEffect(() => {
    const sehir = searchParams.get('sehir')?.trim().toLowerCase()
    if (!sehir) return
    const match = TURKISH_PROVINCES.find((p) => p.slug === sehir)
    if (!match) return
    if (state.city?.slug === match.slug) return
    state.handleSelectCity(match)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL deep-link only
  }, [searchParams])

  const showSetup =
    !isDesktop && (state.needsLocationSetup || state.locationState === 'denied' || state.requestingGps)

  return (
    <>
      <LocalScrollHeaderConfig breakingItems={breakingItems} />

      {!isDesktop ? <LocalNewsMobile state={state} /> : null}

      {isDesktop ? (
        <AdSlotProvider page="category" categoryId="yerel-haber">
          <DesktopLocalNewsPage state={state} />
        </AdSlotProvider>
      ) : null}

      <LocalLocationSetupSheet
        open={showSetup}
        requestingGps={state.requestingGps}
        gpsDenied={state.locationState === 'denied'}
        onAutoLocation={state.startAutoLocation}
        onSelectCity={state.handleSelectCity}
      />
    </>
  )
}

export function LocalNewsClient({ breakingItems = [] }: LocalNewsClientProps) {
  return (
    <Suspense fallback={null}>
      <LocalNewsBody breakingItems={breakingItems} />
    </Suspense>
  )
}
