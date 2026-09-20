import Script from 'next/script'

/**
 * Marks city preview pages before React hydrates, and drops a stale local
 * service-worker cache that can still paint Sinema / Foto galeri.
 */
export function CityPreviewScript() {
  const script = `
    (function() {
      try {
        var host = (location.hostname || '').toLowerCase();
        var tenant = new URLSearchParams(location.search).get('tenant');
        tenant = tenant ? tenant.toLowerCase() : '';
        var cookie = (document.cookie.match(/(?:^|; )nahaber_tenant=([^;]+)/) || [])[1] || '';
        cookie = cookie ? decodeURIComponent(cookie).toLowerCase() : '';
        var sub = host.split('.')[0];
        var slug = tenant || cookie || ((sub === 'canakkale' || sub === 'antalya') ? sub : '');
        var city = slug === 'canakkale' || slug === 'antalya';
        if (city) {
          document.documentElement.setAttribute('data-city-preview', '1');
          document.cookie = 'nahaber_tenant=' + slug + '; Path=/; Max-Age=31536000; SameSite=Lax';
          document.cookie = 'nahaber_province=' + slug + '; Path=/; Max-Age=31536000; SameSite=Lax';
        }

        var local = host === '127.0.0.1' || host === 'localhost' || host.endsWith('.localhost');
        if (local && city && location.pathname === '/feed') {
          location.replace('/?tenant=' + slug);
          return;
        }
        if (!local) return;
        if ('caches' in window) {
          caches.keys().then(function(ks) {
            return Promise.all(ks.filter(function(k) { return k.indexOf('nahaber-') === 0; }).map(function(k) { return caches.delete(k); }));
          }).catch(function() {});
        }
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.getRegistrations().then(function(rs) {
          return Promise.all(rs.map(function(r) { return r.unregister(); }));
        }).catch(function() {});
      } catch (e) {}
    })();
  `

  return (
    <Script id="city-preview-init" strategy="beforeInteractive">
      {script}
    </Script>
  )
}
