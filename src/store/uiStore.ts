'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { STORE_KEYS } from '@/lib/stateKeys'

interface UiStore {
  mobileDrawerOpen: boolean
  feedPolicyOpen: boolean
  setMobileDrawerOpen: (open: boolean) => void
  toggleMobileDrawer: () => void
  setFeedPolicyOpen: (open: boolean) => void
}

export const useUiStore = create<UiStore>()(
  persist(
    (set, get) => ({
      mobileDrawerOpen: false,
      feedPolicyOpen: false,
      setMobileDrawerOpen: (mobileDrawerOpen) => set({ mobileDrawerOpen }),
      toggleMobileDrawer: () => set({ mobileDrawerOpen: !get().mobileDrawerOpen }),
      setFeedPolicyOpen: (feedPolicyOpen) => set({ feedPolicyOpen }),
    }),
    {
      name: STORE_KEYS.UI,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        // Drawer should not reopen after reload; only persist modal if needed.
        feedPolicyOpen: state.feedPolicyOpen,
      }),
    }
  )
)
