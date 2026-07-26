'use client'

import { AdSlotProvider } from '@/context/AdSlotContext'
import { DesktopLocalNewsPage } from '@/components/home/desktop/DesktopLocalNewsPage'
import { LocalLocationSetupSheet } from '@/components/local/LocalLocationSetupSheet'
import { LocalNewsMobile } from '@/components/local/LocalNewsMobile'
import { useScrollHeaderConfig } from '@/context/ScrollHeaderContext'
import { useLocalNewsPage } from '@/hooks/useLocalNewsPage'
import { usePlatformLayout } from '@/hooks/usePlatformLayout'
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

export function LocalNewsClient({ breakingItems = [] }: LocalNewsClientProps) {
  const { isDesktop } = usePlatformLayout()
  const state = useLocalNewsPage()

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
