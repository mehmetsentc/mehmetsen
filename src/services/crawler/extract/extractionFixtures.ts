/**
 * Sanitized offline fixtures for P17.10 deterministic extraction tests.
 * Structures mirror live publisher DOM; no live network required.
 */

/** Confirmed Evrensel structure: subscription CTA nested inside articleBody. */
export const EVRENSEL_GORDES_FIXTURE = `<!doctype html>
<html lang="tr"><head><title>Gördes Belediye Başkanı</title></head>
<body>
<article class="news-article" id="haber-5998608">
  <h1 class="articleTitle">Gördes Belediye Başkanı İbrahim Büke hakkında soruşturma izni</h1>
  <p class="article-spot">Manisa Gördes'te belediye personeli maaş ödemelerine ilişkin soruşturma.</p>
  <div class="haber" id="haberDiv-5998608">
    <div id="5998608" property="articleBody">
      <div class="news-content">
        <p>Manisa’nın Gördes ilçesinde belediye personelinin maaş ödemelerine ilişkin yürütülen resmi inceleme sonucunda Belediye Başkanı İbrahim Büke hakkında soruşturma izni verildi.</p>
        <h3>Savcılık adli soruşturma başlattı</h3>
        <p>HalkTV'nin aktardığına göre; soruşturma izninin ardından Gördes Cumhuriyet Başsavcılığı, Belediye Başkanı hakkında adli soruşturma başlattı.</p>
        <p>Soruşturmanın, belediyedeki personel maaşlarının ödeme süreçlerine ilişkin ön inceleme raporuna dayandığı belirtildi.</p>
        <h3>Bazı maaş ödemeleri 1 hafta gecikti</h3>
        <p>Hazırlanan raporda, incelenen 21 aylık dönemin 12 ayında personel maaşlarının yasal ödeme gününden sonra yatırıldığı ifade edildi.</p>
        <p>Raporda ayrıca, ilgili mali birimlerin maaş ödemelerine ilişkin ödeme talimatlarını zamanında düzenlemediği öne sürüldü.</p>
        <strong>(Halk TV)</strong>
        <div class="evr-sub-cta">
          <h3 class="evr-sub-cta-title">Evrensel'e Abone Ol</h3>
          <p>31 yıldır emeğin sesi olan Evrensel, gücünü sadece okurlarından alıyor.</p>
          <span>E-Gazete</span><span>Sesli Yazılar</span><span>Reklamsız Deneyim</span>
          <button>ABONE OL</button>
          <p>Zaten abone misin? Giriş Yap</p>
        </div>
        <div class="evr-sub-mobil-cta">
          <h3 class="evr-sub-mobil-cta-title">Dijital Evrensel uygulamamız güncellendi</h3>
          <span>E-Gazete</span><span>Sesli Yazılar</span><span>Şifresiz Giriş İmkanı</span>
          <a>App Store'dan İndir</a>
          <a>Google Play'den İndir</a>
          <p>Evrensel'i, Google'da tercih edilen kaynak olarak ekleyin</p>
        </div>
      </div>
    </div>
  </div>
</article>
<!-- related previews also use property=articleBody -->
<div class="preview-content" id="5998554" property="articleBody"><p>İlgili önizleme gövdesi buraya sızmamalı.</p></div>
</body></html>`

/** Long-form journalism: multiple H2 sections MUST all survive. */
export const LONG_ARTICLE_FIXTURE = `<!doctype html>
<html><body>
<article>
  <h1>Kışladağ madeni ve çevresel etkiler</h1>
  <p>Lead paragraph introduces the investigation into mining activity and local water concerns across the highland basin this season.</p>
  <p>Second lead detail covers how residents first reported discoloration in streams after spring rains intensified runoff near the site.</p>
  <h2>TÜPRAG'ın Kışladağ faaliyetleri ve çevresel etkileri</h2>
  <p>Background explains the scale of operations, cyanide leaching methods, and monitoring requirements set by provincial authorities over several years.</p>
  <p>Additional background cites independent lab samples collected from three villages downstream of the facility during 2024 and 2025.</p>
  <h2>TÜPRAG'dan 'sahayla ilgilenmiyoruz' açıklaması</h2>
  <p>Company response denies active exploration in the contested parcel and points to archived environmental impact assessments.</p>
  <blockquote>We are not interested in that field, the company spokesperson said.</blockquote>
  <p>Expert comments from a hydrogeologist warn that historical contamination pathways can persist even when active drilling pauses.</p>
  <p>Final reporting paragraph notes that prosecutors requested additional documents before deciding whether to expand the inquiry.</p>
  <div class="newsletter subscription">Subscribe to our newsletter for more mining coverage.</div>
  <div class="related">Related: Other mine stories you might like</div>
</article>
</body></html>`

export const HABERTURK_LIKE_FIXTURE = `<!doctype html>
<html><body>
<div class="cms-container">
  <h1>Meclis bütçeyi onayladı</h1>
  <p>Milletvekilleri gece oturumunda bütçe tasarısını oy çokluğuyla kabul etti ve uygulamaya ilişkin takvimi netleştirdi.</p>
  <p>Maliye yetkilileri, yeni harcama kalemlerinin önümüzdeki çeyrekte kademeli olarak yürürlüğe gireceğini açıkladı.</p>
  <p>Muhalefet partileri, sosyal yardımların enflasyon karşısında yetersiz kaldığını savundu.</p>
</div>
<aside class="related">Bunları da okuyun</aside>
<footer>Habertürk</footer>
</body></html>`

export const SEMANTIC_WITH_RELATED_FIXTURE = `<!doctype html>
<html><body>
<header>Nav bar</header>
<article>
  <h1>Storm hits coast</h1>
  <p>Residents woke to fallen trees and flooded streets after overnight storms moved across the coastline.</p>
  <p>Emergency crews said power could remain out in several neighborhoods until late afternoon.</p>
  <p>Officials asked people to avoid downed lines and to check on elderly neighbors during the cleanup.</p>
  <div class="related-news">
    <p>Related news module should be stripped from body text completely.</p>
  </div>
</article>
<footer>Site footer</footer>
</body></html>`

export const COMMENT_TRAILER_FIXTURE = `<!doctype html>
<html><body>
<main>
  <div itemprop="articleBody">
    <p>Investigators said the warehouse fire started near electrical panels late Monday evening according to preliminary findings.</p>
    <p>Firefighters contained the blaze before it reached adjacent residential blocks, officials told reporters at the scene.</p>
    <p>An inquiry will examine maintenance logs and recent inspection reports from the facility operator.</p>
    <section id="comments" class="comments">
      <p>User comment one should not appear in article body extraction results.</p>
    </section>
  </div>
</main>
</body></html>`

export const JSON_LD_POLLUTED_EVRENSEL = `<!doctype html>
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": "Belediye soruşturması",
  "articleBody": "Manisa’nın Gördes ilçesinde belediye personelinin maaş ödemelerine ilişkin yürütülen resmi inceleme sonucunda soruşturma izni verildi.\\n\\nHalkTV'nin aktardığına göre savcılık adli soruşturma başlattı ve rapor ödeme gecikmelerini tespit etti.\\n\\nRaporda ayrıca mali birimlerin talimatları zamanında düzenlemediği öne sürüldü.\\n\\nEvrensel'e Abone Ol\\n31 yıldır emeğin sesi olan Evrensel, gücünü sadece okurlarından alıyor.\\nDijital Evrensel uygulamamız güncellendi\\nApp Store'dan İndir"
}
</script>
</head><body></body></html>`
