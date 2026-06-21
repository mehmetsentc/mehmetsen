'use client'

import { useEffect } from 'react'

declare global {
  interface Window {
    OneSignalDeferred?: ((OneSignal: OneSignalSDK) => Promise<void> | void)[]
  }
}

interface OneSignalSDK {
  init(config: Record<string, unknown>): Promise<void>
  Notifications: {
    requestPermission(): Promise<void>
    permission: boolean
  }
}

export function OneSignalProvider() {
  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID
    if (!appId) return

    window.OneSignalDeferred = window.OneSignalDeferred || []
    window.OneSignalDeferred.push(async (OneSignal) => {
      await OneSignal.init({
        appId,
        serviceWorkerPath: '/OneSignalSDKWorker.js',
        serviceWorkerParam: { scope: '/' },
        notifyButton: { enable: false },
        promptOptions: {
          slidedown: {
            prompts: [
              {
                type: 'push',
                autoPrompt: true,
                delay: {
                  pageViews: 2,   // 2. ziyarette göster
                  timeDelay: 15, // 15 saniye bekle
                },
                text: {
                  actionMessage: 'Son dakika haberleri için bildirim almak ister misiniz?',
                  acceptButton: 'Evet, bildir',
                  cancelButton: 'Hayır, teşekkürler',
                },
              },
            ],
          },
        },
      })
    })
  }, [])

  return null
}
