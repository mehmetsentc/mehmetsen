'use client'

import { Bell, BellOff, Loader2 } from 'lucide-react'
import { usePushNotifications } from '@/hooks/usePushNotifications'

/**
 * Toggle button for web push notification subscription.
 * Handles permission request + subscribe/unsubscribe lifecycle.
 */
export function PushToggle() {
  const { supported, permission, subscribed, loading, subscribe, unsubscribe } =
    usePushNotifications()

  if (!supported) return null

  const handleClick = async () => {
    if (subscribed) {
      await unsubscribe()
    } else {
      await subscribe()
    }
  }

  const label = subscribed
    ? 'Son dakika bildirimleri açık'
    : permission === 'denied'
      ? 'Bildirimler engellendi'
      : 'Son dakika bildirimleri al'

  const subLabel = subscribed
    ? 'Dokunarak kapat'
    : permission === 'denied'
      ? 'Tarayıcı ayarlarından izin verin'
      : 'Deprem, kaza ve önemli gelişmelerden anında haberdar ol'

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading || permission === 'denied'}
      className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
        subscribed
          ? 'border-[rgb(var(--color-brand))]/40 bg-[rgb(var(--color-brand))]/8'
          : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          subscribed
            ? 'bg-[rgb(var(--color-brand))] text-white'
            : 'bg-[rgb(var(--color-nav-hover))] text-[rgb(var(--color-muted))]'
        }`}
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : subscribed ? (
          <Bell className="h-5 w-5" />
        ) : (
          <BellOff className="h-5 w-5" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[rgb(var(--color-text))]">{label}</p>
        <p className="mt-0.5 text-xs text-[rgb(var(--color-muted))]">{subLabel}</p>
      </div>

      {/* Toggle pill */}
      <span
        aria-hidden
        className={`h-6 w-10 shrink-0 rounded-full transition-colors ${
          subscribed ? 'bg-[rgb(var(--color-brand))]' : 'bg-[rgb(var(--color-border))]'
        }`}
      >
        <span
          className={`block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
            subscribed ? 'translate-x-4.5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  )
}
