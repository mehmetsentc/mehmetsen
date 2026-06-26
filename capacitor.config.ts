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
    contentInset: 'automatic',
    backgroundColor: '#0a0a0a',
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: true,
  },
};

export default config;
