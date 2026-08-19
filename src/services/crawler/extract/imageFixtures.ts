/** HTML fixtures for article-image extraction quality tests. */

const HERO = 'https://news.test/photos/cinema-hero.jpg'
const RELATED = 'https://news.test/photos/politics-unrelated.jpg'
const SIDEBAR = 'https://news.test/photos/sidebar-other.jpg'
const AD = 'https://ads.test/banner-728x90.jpg'
const GALLERY_1 = 'https://news.test/photos/gallery-1.jpg'
const GALLERY_2 = 'https://news.test/photos/gallery-2.jpg'
const GALLERY_3 = 'https://news.test/photos/gallery-3.jpg'
const OG = 'https://news.test/photos/og-only.jpg'
const LD_A = 'https://news.test/photos/ld-a.jpg'
const LD_B = 'https://news.test/photos/ld-b.jpg'
const LAZY = 'https://news.test/photos/lazy-hero.jpg'
const SRCSET = 'https://news.test/photos/srcset-1200.jpg'

export const IMAGE_FIXTURE_URLS = {
  HERO,
  RELATED,
  SIDEBAR,
  AD,
  GALLERY_1,
  GALLERY_2,
  GALLERY_3,
  OG,
  LD_A,
  LD_B,
  LAZY,
  SRCSET,
}

export function fixtureRelatedNews(): string {
  return `<html><body>
    <article class="article-body">
      <h1>Yeni film vizyonda</h1>
      <figure><img src="${HERO}" width="1200" height="800" alt="Film afişi" /></figure>
      <p>Sinema haberi gövdesi.</p>
      <aside class="related-news">
        <h2>İlgili haberler</h2>
        <a href="/siyaset"><img src="${RELATED}" width="400" height="300" alt="Meclis" /></a>
      </aside>
    </article>
  </body></html>`
}

export function fixtureSidebar(): string {
  return `<html><body>
    <div class="layout">
      <main>
        <article>
          <img src="${HERO}" width="1100" height="700" alt="Haber" />
        </article>
      </main>
      <aside class="sidebar">
        <div class="popular most-read">
          <img src="${SIDEBAR}" width="300" height="200" alt="Popüler" />
        </div>
      </aside>
    </div>
  </body></html>`
}

export function fixtureAds(): string {
  return `<html><body>
    <header><img src="${AD}" class="advertisement banner" width="728" height="90" alt="Reklam" /></header>
    <article>
      <img src="${HERO}" width="1000" height="650" alt="Haber fotoğrafı" />
    </article>
    <div class="widget advertisement">
      <img src="https://news.test/reklam/kampanya-banner.jpg" width="300" height="250" alt="Kampanya" />
    </div>
  </body></html>`
}

export function fixtureGallery(): string {
  return `<html><body>
    <article>
      <figure><img src="${GALLERY_1}" width="1400" height="900" alt="Galeri 1" /><figcaption>Sahne 1</figcaption></figure>
      <figure><img src="${GALLERY_2}" width="1400" height="900" alt="Galeri 2" /><figcaption>Sahne 2</figcaption></figure>
      <figure><img src="${GALLERY_3}" width="1400" height="900" alt="Galeri 3" /><figcaption>Sahne 3</figcaption></figure>
      <figure><img src="${HERO}" width="1400" height="900" alt="Galeri 4" /></figure>
      <div class="related recommended"><img src="${RELATED}" width="400" height="280" alt="Başka haber" /></div>
    </article>
  </body></html>`
}

export function fixtureOgOnly(): string {
  return `<html><head>
    <meta property="og:image" content="${OG}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
  </head><body>
    <nav><img src="https://news.test/logo.svg" class="site-logo" width="80" height="24" alt="Logo" /></nav>
    <div class="most-read"><img src="${RELATED}" width="120" height="80" alt="thumb" /></div>
  </body></html>`
}

export function fixtureJsonLdArray(): string {
  return `<html><head>
    <script type="application/ld+json">${JSON.stringify({
      '@type': 'NewsArticle',
      image: [LD_A, { '@type': 'ImageObject', url: LD_B, width: 1600, height: 900 }],
    })}</script>
  </head><body>
    <article><p>Metin</p></article>
  </body></html>`
}

export function fixtureLazyLoad(): string {
  return `<html><body>
    <article>
      <img data-src="${LAZY}" data-lazy-src="${LAZY}" class="lazyload" width="1200" height="800" alt="Lazy" />
    </article>
    <aside class="sidebar related-news">
      <img data-src="${RELATED}" width="200" height="120" alt="önerilen" />
    </aside>
  </body></html>`
}

export function fixtureSrcsetPicture(): string {
  return `<html><body>
    <article>
      <picture>
        <source srcset="https://news.test/photos/srcset-400.jpg 400w, ${SRCSET} 1200w" />
        <img src="https://news.test/photos/srcset-400.jpg" alt="Manşet" width="400" height="260" />
      </picture>
    </article>
    <div class="carousel recommended">
      <img src="${RELATED}" width="400" height="300" alt="Carousel dışı" />
    </div>
  </body></html>`
}
