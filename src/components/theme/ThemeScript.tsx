import Script from 'next/script'
import { THEME_STORAGE_KEY } from '@/lib/theme'

/**
 * Tema init — FOUC (flash of unstyled content) önlemek için
 * `beforeInteractive` çalışır. Stored preference'a göre html sınıfını ve
 * data-theme attribute'unu uygular.
 */
export function ThemeScript() {
  const script = `
    (function() {
      try {
        var pref = localStorage.getItem('${THEME_STORAGE_KEY}') || 'system';
        var resolved = pref;
        if (pref === 'system') {
          resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        var root = document.documentElement;
        var path = location.pathname || '';
        var forceDark =
          path === '/feed-v2' ||
          path.indexOf('/feed-v2/') === 0 ||
          path === '/feed-v3' ||
          path.indexOf('/feed-v3/') === 0 ||
          path === '/reels' ||
          path.indexOf('/reels/') === 0 ||
          path === '/video' ||
          path.indexOf('/video/') === 0;
        if (forceDark || resolved !== 'light') root.classList.add('dark');
        if (resolved === 'oled') root.setAttribute('data-theme', 'oled');
        var w = window.innerWidth;
        root.setAttribute('data-platform', w >= 1024 ? 'desktop' : w >= 768 ? 'tablet' : 'mobile');
      } catch (e) {}
    })();
  `

  return (
    <Script id="theme-init" strategy="beforeInteractive">
      {script}
    </Script>
  )
}
