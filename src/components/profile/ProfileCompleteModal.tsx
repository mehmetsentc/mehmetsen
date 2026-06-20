'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Sparkles } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import type { User } from '@/types/user'

function dismissKey(uid: string) {
  return `nahaber_profile_prompt_v1_${uid}`
}

function isProfileIncomplete(user: User): boolean {
  return (
    !user.favoriteCategories?.length ||
    !user.bio ||
    !user.location
  )
}

interface ProfileCompleteModalProps {
  user: User
}

export function ProfileCompleteModal({ user }: ProfileCompleteModalProps) {
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isProfileIncomplete(user)) return
    try {
      const dismissed = localStorage.getItem(dismissKey(user.uid))
      if (!dismissed) setVisible(true)
    } catch {
      // localStorage erişim hatası — sessizce geç
    }
  }, [user])

  if (!visible) return null

  const handleDismiss = () => {
    try {
      localStorage.setItem(dismissKey(user.uid), '1')
    } catch { /* ignore */ }
    setVisible(false)
  }

  const handleComplete = () => {
    handleDismiss()
    router.push(ROUTES.SETTINGS_PROFILE)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={handleDismiss}
        aria-hidden
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-prompt-title"
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md rounded-t-2xl bg-[rgb(var(--color-card))] p-6 shadow-2xl sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
      >
        {/* Kapat butonu */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-4 top-4 rounded-full p-1 text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-border))] hover:text-[rgb(var(--color-text))]"
          aria-label="Kapat"
        >
          <X className="h-4 w-4" />
        </button>

        {/* İkon */}
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgb(var(--color-primary))]/10">
            <Sparkles className="h-7 w-7 text-[rgb(var(--color-primary))]" />
          </div>
        </div>

        {/* İçerik */}
        <h2 id="profile-prompt-title" className="text-center text-lg font-black text-[rgb(var(--color-text))]">
          Profilini tamamla
        </h2>
        <p className="mt-2 text-center text-sm text-[rgb(var(--color-muted))]">
          İlgi alanlarını ve şehrini ekleyerek sana özel haber akışı oluştur.
        </p>

        {/* Eksik alanlar */}
        <ul className="mt-4 space-y-2 rounded-xl bg-[rgb(var(--color-surface))] p-3">
          {!user.location && (
            <li className="flex items-center gap-2 text-sm text-[rgb(var(--color-muted))]">
              <span className="text-base">📍</span> Şehrin belirtilmemiş
            </li>
          )}
          {!user.bio && (
            <li className="flex items-center gap-2 text-sm text-[rgb(var(--color-muted))]">
              <span className="text-base">✏️</span> Biyografi eklenmemiş
            </li>
          )}
          {!user.favoriteCategories?.length && (
            <li className="flex items-center gap-2 text-sm text-[rgb(var(--color-muted))]">
              <span className="text-base">✨</span> Haber kategorisi seçilmemiş
            </li>
          )}
        </ul>

        {/* Butonlar */}
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleComplete}
            className="w-full rounded-xl bg-[rgb(var(--color-primary))] py-3 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Profil bilgilerimi tamamla
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full rounded-xl py-2.5 text-sm font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
          >
            Daha sonra
          </button>
        </div>
      </div>
    </>
  )
}
