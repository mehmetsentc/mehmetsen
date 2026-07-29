'use client'

import { MobileAdminProvider, useMobileAdmin } from './MobileAdminContext'
import { MobileAdminHeader } from './MobileAdminHeader'
import { MobileAdminBottomNav } from './MobileAdminBottomNav'
import { MobileCreateSheet } from './MobileCreateSheet'

function MobilePadding({ children }: { children: React.ReactNode }) {
  const { hideChrome } = useMobileAdmin()
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto"
      style={{
        paddingBottom: hideChrome
          ? 'max(0.5rem, env(safe-area-inset-bottom, 0px))'
          : 'calc(3.75rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {children}
    </div>
  )
}

/**
 * Mobile chrome around admin main content (lg:hidden only).
 * Desktop sidebar remains separate in layout — unchanged.
 */
export function MobileAdminChrome({ children }: { children: React.ReactNode }) {
  return (
    <MobileAdminProvider>
      <div className="flex h-full min-h-0 flex-1 flex-col lg:hidden">
        <MobileAdminHeader />
        <MobilePadding>{children}</MobilePadding>
        <MobileAdminBottomNav />
        <MobileCreateSheet />
      </div>
    </MobileAdminProvider>
  )
}
