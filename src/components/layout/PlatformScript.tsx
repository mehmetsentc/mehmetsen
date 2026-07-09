import Script from 'next/script'

export function PlatformScript() {
  const script = `
    (function() {
      try {
        var w = window.innerWidth;
        var p = w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
        document.documentElement.dataset.platform = p;
        var raw = localStorage.getItem('nahaber:uiStore:v1');
        var sidebarOpen = true;
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed.state && parsed.state.desktopSidebarOpen === false) {
            sidebarOpen = false;
          }
        }
        document.documentElement.dataset.sidebar = sidebarOpen ? 'open' : 'closed';
      } catch (e) {
        document.documentElement.dataset.sidebar = 'open';
      }
    })();
  `

  return (
    <Script id="platform-init" strategy="beforeInteractive">
      {script}
    </Script>
  )
}
