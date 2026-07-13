'use client'

import { useEffect, useRef } from 'react'
import { TrendingUp } from 'lucide-react'

// ── TradingView temeli ─────────────────────────────────────────────────────────
// colorTheme: dark — uygulama dark navy temasıyla uyumlu
const TV_THEME = 'dark'

interface TVConfig {
  [key: string]: unknown
}

function TVWidget({ src, config }: { src: string; config: TVConfig }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Önceki içeriği temizle
    el.innerHTML = ''

    const inner = document.createElement('div')
    inner.className = 'tradingview-widget-container__widget'
    el.appendChild(inner)

    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.src = src
    script.async = true
    // TradingView config: innerHTML değil text kullanılmalı
    // (src + innerHTML birlikte bazı browserlarda çalışmaz)
    script.text = JSON.stringify(config)
    el.appendChild(script)

    return () => {
      el.innerHTML = ''
    }
    // config değiştiğinde yeniden yükle — stringify ile referans karşılaştırması yapılıyor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, JSON.stringify(config)])

  return <div className="tradingview-widget-container w-full overflow-hidden" ref={ref} />
}

// ── Endeks mini kart ───────────────────────────────────────────────────────────
function IndexMiniChart({ symbol, name }: { symbol: string; name: string }) {
  return (
    <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-2 overflow-hidden">
      <p className="mb-1 px-1 text-[11px] font-semibold text-[rgb(var(--color-muted))] uppercase tracking-wide">
        {name}
      </p>
      <TVWidget
        src="https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js"
        config={{
          symbol,
          width: '100%',
          height: 150,
          locale: 'tr',
          dateRange: '1D',
          colorTheme: TV_THEME,
          isTransparent: true,
          autosize: true,
          largeChartUrl: '',
          noTimeScale: false,
          chartOnly: false,
          valuesTracking: '1',
          changeMode: 'price-and-percent',
          lineType: 0,
          lineWidth: 2,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
        }}
      />
    </div>
  )
}

// ── Ana widget bileşeni ────────────────────────────────────────────────────────
export function BorsaWidget() {
  return (
    <div className="mb-6 space-y-4">
      {/* Başlık */}
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-[#22C55E]" />
        <span className="text-sm font-bold text-[rgb(var(--color-text))]">Canlı Piyasa Verileri</span>
        <span className="flex items-center gap-1 rounded-full bg-[#22C55E]/15 px-2 py-0.5 text-[10px] font-semibold text-[#22C55E]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22C55E]" />
          CANLI
        </span>
      </div>

      {/* ── Hisse bandı (ticker tape) ── */}
      <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] overflow-hidden">
        <TVWidget
          src="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js"
          config={{
            symbols: [
              { proName: 'BIST:XU100',  description: 'BIST 100' },
              { proName: 'BIST:XU030',  description: 'BIST 30' },
              { proName: 'BIST:XBANK',  description: 'Banka' },
              { proName: 'BIST:THYAO',  description: 'THY' },
              { proName: 'BIST:GARAN',  description: 'Garanti' },
              { proName: 'BIST:AKBNK',  description: 'Akbank' },
              { proName: 'BIST:EREGL',  description: 'Ereğli' },
              { proName: 'BIST:ASELS',  description: 'Aselsan' },
              { proName: 'BIST:KCHOL',  description: 'Koç Holding' },
              { proName: 'BIST:BIMAS',  description: 'BİM' },
              { proName: 'BIST:TCELL',  description: 'Turkcell' },
              { proName: 'BIST:TUPRS',  description: 'Tüpraş' },
              { proName: 'BIST:ISCTR',  description: 'İş Bankası' },
              { proName: 'BIST:SASA',   description: 'Sasa' },
              { proName: 'BIST:FROTO',  description: 'Ford Otosan' },
              { proName: 'BIST:TOASO',  description: 'Tofaş' },
              { proName: 'FOREXCOM:USDTRY', description: 'Dolar/TL' },
              { proName: 'FOREXCOM:EURTRY', description: 'Euro/TL' },
              { proName: 'COMEX:GC1!',      description: 'Altın' },
              { proName: 'TVC:BRENTOIL',    description: 'Brent' },
            ],
            showSymbolLogo: false,
            isTransparent: true,
            displayMode: 'adaptive',
            colorTheme: TV_THEME,
            locale: 'tr',
          }}
        />
      </div>

      {/* ── Endeks mini grafik kartları ── */}
      <div className="grid grid-cols-3 gap-3">
        <IndexMiniChart symbol="BIST:XU100" name="BIST 100" />
        <IndexMiniChart symbol="BIST:XU030" name="BIST 30" />
        <IndexMiniChart symbol="BIST:XBANK" name="Banka Endeksi" />
      </div>

      {/* ── Piyasa özeti — endeksler + popüler hisseler ── */}
      <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] overflow-hidden">
        <div className="px-4 pt-3 pb-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
            Piyasa Özeti
          </p>
        </div>
        <TVWidget
          src="https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js"
          config={{
            colorTheme: TV_THEME,
            dateRange: '1D',
            showChart: true,
            locale: 'tr',
            largeChartUrl: '',
            isTransparent: true,
            showSymbolLogo: false,
            showFloatingTooltip: false,
            width: '100%',
            height: 500,
            plotLineColorGrowing: 'rgba(41, 98, 255, 1)',
            plotLineColorFalling: 'rgba(41, 98, 255, 1)',
            gridLineColor: 'rgba(42, 46, 57, 0)',
            scaleFontColor: 'rgba(134, 137, 147, 1)',
            belowLineFillColorGrowing: 'rgba(41, 98, 255, 0.12)',
            belowLineFillColorFalling: 'rgba(41, 98, 255, 0.12)',
            belowLineFillColorGrowingBottom: 'rgba(41, 98, 255, 0)',
            belowLineFillColorFallingBottom: 'rgba(41, 98, 255, 0)',
            symbolActiveColor: 'rgba(41, 98, 255, 0.12)',
            tabs: [
              {
                title: 'BIST Endeksler',
                symbols: [
                  { s: 'BIST:XU100',  d: 'BIST 100' },
                  { s: 'BIST:XU030',  d: 'BIST 30' },
                  { s: 'BIST:XBANK',  d: 'Banka Endeksi' },
                  { s: 'BIST:XUSIN',  d: 'Sınai Endeksi' },
                  { s: 'BIST:XUTEK',  d: 'Teknoloji Endeksi' },
                  { s: 'BIST:XGIDA',  d: 'Gıda Endeksi' },
                  { s: 'BIST:XHOLD',  d: 'Holding Endeksi' },
                ],
                originalTitle: 'Indices',
              },
              {
                title: 'Popüler Hisseler',
                symbols: [
                  { s: 'BIST:THYAO', d: 'Türk Hava Yolları' },
                  { s: 'BIST:GARAN', d: 'Garanti BBVA' },
                  { s: 'BIST:AKBNK', d: 'Akbank' },
                  { s: 'BIST:EREGL', d: 'Ereğli Demir Çelik' },
                  { s: 'BIST:ASELS', d: 'Aselsan' },
                  { s: 'BIST:KCHOL', d: 'Koç Holding' },
                  { s: 'BIST:BIMAS', d: 'BİM Mağazalar' },
                  { s: 'BIST:TCELL', d: 'Turkcell' },
                  { s: 'BIST:ISCTR', d: 'İş Bankası C' },
                  { s: 'BIST:TUPRS', d: 'Tüpraş' },
                ],
                originalTitle: 'Stocks',
              },
              {
                title: 'Döviz & Emtia',
                symbols: [
                  { s: 'FOREXCOM:USDTRY', d: 'Dolar / TL' },
                  { s: 'FOREXCOM:EURTRY', d: 'Euro / TL' },
                  { s: 'FOREXCOM:GBPTRY', d: 'Sterlin / TL' },
                  { s: 'COMEX:GC1!',      d: 'Altın (Vadeli)' },
                  { s: 'COMEX:SI1!',      d: 'Gümüş (Vadeli)' },
                  { s: 'TVC:BRENTOIL',    d: 'Brent Petrol' },
                  { s: 'NYMEX:CL1!',      d: 'Ham Petrol (WTI)' },
                ],
                originalTitle: 'Commodities',
              },
            ],
          }}
        />
      </div>

      {/* Kaynak notu */}
      <p className="text-center text-[10px] text-[rgb(var(--color-muted))]">
        Veriler TradingView üzerinden sağlanmaktadır · Gecikmeli olabilir
      </p>
    </div>
  )
}
