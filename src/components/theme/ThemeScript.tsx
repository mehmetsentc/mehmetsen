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
          path === '/reels' ||
          path.indexOf('/reels/') === 0 ||
          path === '/video' ||
          path.indexOf('/video/') === 0;
        if (forceDark || resolved !== 'light') root.classList.add('dark');
        else root.classList.remove('dark');
        if (resolved === 'oled') root.setAttribute('data-theme', 'oled');
        var w = window.innerWidth;
        root.setAttribute('data-platform', w >= 1024 ? 'desktop' : w >= 768 ? 'tablet' : 'mobile');
        var newspaper = !(
          path === '/reels' || path.indexOf('/reels/') === 0 ||
          path === '/video' || path.indexOf('/video/') === 0 ||
          path.indexOf('/messages') === 0 || path.indexOf('/mesajlar') === 0 ||
          path.indexOf('/admin') === 0 ||
          path.indexOf('/login') === 0 || path.indexOf('/giris') === 0 ||
          path.indexOf('/register') === 0 || path.indexOf('/kayit') === 0 ||
          path.indexOf('/onboarding') === 0 ||
          path.indexOf('/saved') === 0 || path.indexOf('/kaydedilenler') === 0 ||
          path.indexOf('/settings') === 0 || path.indexOf('/ayarlar') === 0 ||
          path.indexOf('/notifications') === 0 || path.indexOf('/bildirimler') === 0
        );
        root.setAttribute('data-desktop-header', newspaper ? 'newspaper' : 'none');
      } catch (e) {}
    })();
  `

  return (
    <Script id="theme-init" strategy="beforeInteractive">
      {script}
    </Script>
  )
}
