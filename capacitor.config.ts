import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nahaber.app',
  appName: 'NaHaber',
  webDir: 'out',
  // Canlı site modunda çalış (SSR destekli)
  server: {
    url: 'https://www.nahaber.com',
    cleartext: false,
  },
  ios: {
    // NEVER use 'automatic': it insets WKWebView scroll content under the
    // status bar while leaving a compositor gap where feed images paint
    // during scroll (App Store–only; Safari/web is fine). Match Safari:
    // full-bleed WebView + CSS env(safe-area-inset-*).
    contentInset: 'never',
    backgroundColor: '#11192B',
    scrollEnabled: true,
    // limitsNavigationsToAppBoundDomains kaldırıldı — remote URL modunda
    // WKAppBoundDomains kısıtlaması Firebase/API çağrılarını engelleyebilir
  },
  android: {
    backgroundColor: '#0a0a0a',
    allowMixedContent: false,
  },
};

export default config;
