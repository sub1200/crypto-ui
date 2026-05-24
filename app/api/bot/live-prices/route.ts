import { JsonStorage } from '../../../../bot/storage/storage'

const storage = new JsonStorage()

const BINANCE_API = 'https://api.binance.com/api/v3'

export async function GET() {
  const trades = storage.getTrades()
  const openTrades = trades.filter(t => t.status === 'open')
  const symbols = [...new Set(openTrades.map(t => t.symbol))]

  if (symbols.length === 0) {
    return Response.json({ prices: {}, trades: [] })
  }

  const prices: Record<string, number> = {}

  try {
    const query = symbols
      .map(s => `"${s.replace('/', '')}"`)
      .join(',')

    const res = await fetch(`${BINANCE_API}/ticker/price?symbols=[${query}]`, {
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json()

    if (Array.isArray(data)) {
      for (const item of data) {
        const symbol = item.symbol.replace(/(USDT|BTC|ETH|BNB)$/, '/$1')
        prices[symbol] = parseFloat(item.price)
      }
    }
  } catch (e) {
    return Response.json({ error: 'Failed to fetch prices', detail: String(e) }, { status: 500 })
  }

  const enrichedTrades = openTrades.map(t => {
    const currentPrice = prices[t.symbol] || 0
    const unrealizedPnL = currentPrice > 0 && t.entryPrice > 0
      ? (currentPrice - t.entryPrice) * t.amount * (t.side === 'buy' ? 1 : -1)
      : null
    const unrealizedPnLPercent = currentPrice > 0 && t.entryPrice > 0
      ? ((currentPrice - t.entryPrice) / t.entryPrice) * 100 * (t.side === 'buy' ? 1 : -1)
      : null

    return {
      id: t.id,
      symbol: t.symbol,
      side: t.side,
      entryPrice: t.entryPrice,
      currentPrice,
      amount: t.amount,
      totalCost: t.totalCost,
      stopLoss: t.stopLoss,
      takeProfit: t.takeProfit,
      unrealizedPnL: unrealizedPnL ? Math.round(unrealizedPnL * 100) / 100 : null,
      unrealizedPnLPercent: unrealizedPnLPercent ? Math.round(unrealizedPnLPercent * 100) / 100 : null,
      openedAt: t.openedAt,
      reason: t.reason,
    }
  })

  return Response.json({ prices, trades: enrichedTrades })
}
