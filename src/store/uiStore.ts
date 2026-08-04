'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { STORE_KEYS } from '@/lib/stateKeys'

interface UiStore {
  mobileDrawerOpen: boolean
  desktopSidebarOpen: boolean
  feedPolicyOpen: boolean
  setMobileDrawerOpen: (open: boolean) => void
  toggleMobileDrawer: () => void
  setDesktopSidebarOpen: (open: boolean) => void
  toggleDesktopSidebar: () => void
  setFeedPolicyOpen: (open: boolean) => void
}

export const useUiStore = create<UiStore>()(
  persist(
    (set, get) => ({
      mobileDrawerOpen: false,
      // Desktop menü her oturumda kapalı başlar; hamburger ile açılır
      desktopSidebarOpen: false,
      feedPolicyOpen: false,
      setMobileDrawerOpen: (mobileDrawerOpen) => set({ mobileDrawerOpen }),
      toggleMobileDrawer: () => set({ mobileDrawerOpen: !get().mobileDrawerOpen }),
      setDesktopSidebarOpen: (desktopSidebarOpen) => set({ desktopSidebarOpen }),
      toggleDesktopSidebar: () => set({ desktopSidebarOpen: !get().desktopSidebarOpen }),
      setFeedPolicyOpen: (feedPolicyOpen) => set({ feedPolicyOpen }),
    }),
    {
      name: STORE_KEYS.UI,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        feedPolicyOpen: state.feedPolicyOpen,
        // desktopSidebarOpen persist edilmez — varsayılan kapalı
      }),
    }
  )
)
