import Script from 'next/script'

/**
 * Early platform + native-shell markers on <html>.
 * `data-platform` = viewport bucket (mobile/tablet/desktop).
 * `data-native-shell` = Capacitor/Cordova store app (`ios` | `android`) — absent on web/PWA.
 */
export function PlatformScript() {
  const script = `
    (function() {
      try {
        var root = document.documentElement;
        var w = window.innerWidth;
        root.dataset.platform = w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
        root.dataset.sidebar = 'closed';
        var shell = '';
        var cap = window.Capacitor;
        if (cap) {
          try {
            if (typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
              shell = (typeof cap.getPlatform === 'function' && cap.getPlatform()) || 'native';
            } else if (typeof cap.getPlatform === 'function') {
              var p = cap.getPlatform();
              if (p === 'ios' || p === 'android') shell = p;
            }
          } catch (e) {}
        }
        if (!shell) {
          var ua = navigator.userAgent || '';
          if (/Capacitor/i.test(ua) || /Cordova/i.test(ua)) {
            shell = /Android/i.test(ua) ? 'android' : 'ios';
          } else if (window.cordova) {
            shell = /Android/i.test(ua) ? 'android' : 'ios';
          }
        }
        if (shell === 'ios' || shell === 'android') {
          root.dataset.nativeShell = shell;
        } else {
          delete root.dataset.nativeShell;
        }
      } catch (e) {
        try { document.documentElement.dataset.sidebar = 'closed'; } catch (e2) {}
      }
    })();
  `

  return (
    <Script id="platform-init" strategy="beforeInteractive">
      {script}
    </Script>
  )
}
