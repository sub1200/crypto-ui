import { JsonStorage } from '../../../../bot/storage/storage'

const storage = new JsonStorage()

export async function GET() {
  const today = storage.getTodaysStats()
  const overall = storage.getOverallStats()
  const trades = storage.getTrades()
  const closed = trades.filter(t => t.status === 'closed')

  const profitByDay: Record<string, number> = {}
  closed.forEach(t => {
    if (t.closedAt) {
      const day = t.closedAt.split('T')[0]
      profitByDay[day] = (profitByDay[day] || 0) + (t.profit || 0)
    }
  })

  const profitBySymbol: Record<string, { trades: number; profit: number; wins: number }> = {}
  closed.forEach(t => {
    if (!profitBySymbol[t.symbol]) {
      profitBySymbol[t.symbol] = { trades: 0, profit: 0, wins: 0 }
    }
    profitBySymbol[t.symbol].trades++
    profitBySymbol[t.symbol].profit += t.profit || 0
    if ((t.profit || 0) > 0) profitBySymbol[t.symbol].wins++
  })

  return Response.json({
    today,
    overall,
    profitByDay: Object.entries(profitByDay).sort(([a], [b]) => a.localeCompare(b)),
    profitBySymbol: Object.entries(profitBySymbol).map(([symbol, data]) => ({
      symbol,
      ...data,
      winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
    })),
  })
}
