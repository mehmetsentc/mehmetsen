/**
 * NativeGeolocationPlugin — iOS CLLocationManager ile doğrudan konum izni ister.
 *
 * Neden gerekli:
 * Capacitor remote-URL (https://www.nahaber.com) modunda navigator.geolocation çağrısı
 * WKWebView üzerinden geçer. iOS 17+ cihazlarda WKUIDelegate gereksinimi yerine
 * getirilmediğinde dialog sessizce başarısız olur.
 * Bu plugin CLLocationManager.requestWhenInUseAuthorization() ile native dialog garantiler.
 *
 * Kullanım: sadece iOS Capacitor ortamında çağrılmalı.
 */
import { registerPlugin } from '@capacitor/core'

export interface NativeGeolocationResult {
  status: 'granted' | 'denied' | 'prompt'
}

export interface NativeGeolocationPlugin {
  requestPermission(): Promise<NativeGeolocationResult>
}

// IMPORTANT: Capacitor strips "Plugin" suffix from @objc names for JS bridge mapping.
// Swift: @objc(NativeGeolocationPlugin) → JS bridge name: "NativeGeolocation"
const NativeGeolocation = registerPlugin<NativeGeolocationPlugin>('NativeGeolocation', {
  web: {
    // Web'de navigator.permissions.query kullan
    requestPermission: async () => {
      try {
        const result = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
        return { status: (result?.state ?? 'prompt') as NativeGeolocationResult['status'] }
      } catch {
        return { status: 'prompt' }
      }
    },
  },
})

export default NativeGeolocation
