import { NextResponse } from 'next/server'

export const runtime = 'edge'
export const revalidate = 60

export interface BistQuote {
  symbol: string   // Yahoo sembolü (XU100.IS)
  ticker: string   // Görünen sembol (XU100)
  name: string
  price: number
  change: number     // Mutlak değişim
  changePct: number  // Yüzde değişim
  prevClose: number
  type: 'index' | 'stock' | 'fx' | 'commodity'
}

export interface BistData {
  indices: BistQuote[]
  stocks: BistQuote[]
  fx: BistQuote[]
  commodities: BistQuote[]
  updatedAt: number
}

const INDICES = [
  { symbol: 'XU100.IS', ticker: 'XU100', name: 'BIST 100', type: 'index' as const },
  { symbol: 'XU030.IS', ticker: 'XU030', name: 'BIST 30', type: 'index' as const },
  { symbol: 'XBANK.IS', ticker: 'XBANK', name: 'Banka Endeksi', type: 'index' as const },
  { symbol: 'XUSIN.IS', ticker: 'XUSIN', name: 'Sınai Endeks', type: 'index' as const },
  { symbol: 'XUTEK.IS', ticker: 'XUTEK', name: 'Teknoloji', type: 'index' as const },
]

const STOCKS = [
  { symbol: 'THYAO.IS', ticker: 'THYAO', name: 'Türk Hava Yolları', type: 'stock' as const },
  { symbol: 'GARAN.IS', ticker: 'GARAN', name: 'Garanti BBVA', type: 'stock' as const },
  { symbol: 'AKBNK.IS', ticker: 'AKBNK', name: 'Akbank', type: 'stock' as const },
  { symbol: 'EREGL.IS', ticker: 'EREGL', name: 'Ereğli Demir Çelik', type: 'stock' as const },
  { symbol: 'ASELS.IS', ticker: 'ASELS', name: 'Aselsan', type: 'stock' as const },
  { symbol: 'KCHOL.IS', ticker: 'KCHOL', name: 'Koç Holding', type: 'stock' as const },
  { symbol: 'BIMAS.IS', ticker: 'BIMAS', name: 'BİM Mağazalar', type: 'stock' as const },
  { symbol: 'TCELL.IS', ticker: 'TCELL', name: 'Turkcell', type: 'stock' as const },
  { symbol: 'ISCTR.IS', ticker: 'ISCTR', name: 'İş Bankası C', type: 'stock' as const },
  { symbol: 'TUPRS.IS', ticker: 'TUPRS', name: 'Tüpraş', type: 'stock' as const },
  { symbol: 'SASA.IS',  ticker: 'SASA',  name: 'SASA Polyester', type: 'stock' as const },
  { symbol: 'FROTO.IS', ticker: 'FROTO', name: 'Ford Otosan', type: 'stock' as const },
]

const FX = [
  { symbol: 'USDTRY=X', ticker: 'USD/TL', name: 'Dolar / TL', type: 'fx' as const },
  { symbol: 'EURTRY=X', ticker: 'EUR/TL', name: 'Euro / TL', type: 'fx' as const },
  { symbol: 'GBPTRY=X', ticker: 'GBP/TL', name: 'Sterlin / TL', type: 'fx' as const },
]

const COMMODITIES = [
  { symbol: 'GC=F',      ticker: 'ALTIN', name: 'Altın (Vadeli, USD/oz)', type: 'commodity' as const },
  { symbol: 'BZ=F',      ticker: 'BRENT', name: 'Brent Petrol', type: 'commodity' as const },
  { symbol: 'BTC-USD',   ticker: 'BTC',   name: 'Bitcoin', type: 'commodity' as const },
]

interface YahooMeta {
  regularMarketPrice?: number
  previousClose?: number
  chartPreviousClose?: number
}

async function fetchBatch(symbols: string[]): Promise<Map<string, YahooMeta>> {
  const result = new Map<string, YahooMeta>()
  // Yahoo Finance v7 quotes endpoint — paralel değil, batch sorgu
  const syms = symbols.join('%2C')
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}&fields=regularMarketPrice,regularMarketPreviousClose,chartPreviousClose`
  const fallback = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${syms}&fields=regularMarketPrice,regularMarketPreviousClose,chartPreviousClose`

  for (const endpoint of [url, fallback]) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NaHaber/1.0)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok) continue
      const data = await res.json() as {
        quoteResponse?: {
          result?: Array<{
            symbol?: string
            regularMarketPrice?: number
            regularMarketPreviousClose?: number
            chartPreviousClose?: number
          }>
        }
      }
      for (const q of data.quoteResponse?.result ?? []) {
        if (!q.symbol) continue
        result.set(q.symbol, {
          regularMarketPrice: q.regularMarketPrice,
          previousClose: q.regularMarketPreviousClose ?? q.chartPreviousClose,
        })
      }
      if (result.size > 0) break
    } catch {
      continue
    }
  }
  return result
}

function toQuote(
  def: { symbol: string; ticker: string; name: string; type: BistQuote['type'] },
  meta: YahooMeta | undefined
): BistQuote {
  const price = meta?.regularMarketPrice ?? 0
  const prev  = meta?.previousClose ?? price
  const change    = Math.round((price - prev) * 100) / 100
  const changePct = prev > 0 ? Math.round(((price - prev) / prev) * 10000) / 100 : 0
  return {
    symbol:    def.symbol,
    ticker:    def.ticker,
    name:      def.name,
    type:      def.type,
    price,
    change,
    changePct,
    prevClose: prev,
  }
}

export async function GET() {
  try {
    const allDefs = [...INDICES, ...STOCKS, ...FX, ...COMMODITIES]
    const allSymbols = allDefs.map((d) => d.symbol)

    // Yahoo tek seferlik batch sorgusu — tüm semboller
    const prices = await fetchBatch(allSymbols)

    const indices     = INDICES.map((d) => toQuote(d, prices.get(d.symbol)))
    const stocks      = STOCKS.map((d) => toQuote(d, prices.get(d.symbol)))
    const fx          = FX.map((d) => toQuote(d, prices.get(d.symbol)))
    const commodities = COMMODITIES.map((d) => toQuote(d, prices.get(d.symbol)))

    const body: BistData = { indices, stocks, fx, commodities, updatedAt: Date.now() }
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  } catch (err) {
    console.error('[finance/bist]', err)
    return NextResponse.json({ error: 'Veri alınamadı' }, { status: 502 })
  }
}
