import { BotConfig } from '../config'
import { JsonStorage, ReviewRecord, TradeRecord } from '../storage/storage'
import { v4 as uuidv4 } from 'uuid'

export class ReviewAgent {
  private config: BotConfig['review']

  constructor(config: BotConfig['review']) {
    this.config = config
  }

  async runReview(storage: JsonStorage): Promise<ReviewRecord> {
    console.log('=== AUTO REVIEW ===')

    const trades = storage.getTrades()
    const closedTrades = trades.filter(t => t.status === 'closed')

    const now = new Date()
    const since = new Date(now.getTime() - this.config.intervalHours * 60 * 60 * 1000)
    const recentTrades = closedTrades.filter(t => t.closedAt && new Date(t.closedAt) >= since)

    const wins = recentTrades.filter(t => (t.profit || 0) > 0)
    const losses = recentTrades.filter(t => (t.profit || 0) < 0)

    const totalProfit = recentTrades.reduce((sum, t) => sum + (t.profit || 0), 0)
    const totalLoss = recentTrades.reduce((sum, t) => sum + Math.min(t.profit || 0, 0), 0)
    const grossProfit = wins.reduce((sum, t) => sum + (t.profit || 0), 0)
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + (t.profit || 0), 0))

    const netProfit = totalProfit
    const winRate = recentTrades.length > 0 ? (wins.length / recentTrades.length) * 100 : 0
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0

    const profitPercentages = recentTrades.map(t => t.profitPercent || 0)
    const avgReturn = profitPercentages.length > 0
      ? profitPercentages.reduce((a, b) => a + b, 0) / profitPercentages.length
      : 0

    const stdDev = Math.sqrt(
      profitPercentages.reduce((sum, val) => sum + Math.pow(val - avgReturn, 2), 0) /
      (profitPercentages.length || 1)
    )
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(24) : 0

    let peak = 0
    let maxDrawdown = 0
    let cumulative = 0
    for (const t of recentTrades.sort((a, b) => new Date(a.closedAt || 0).getTime() - new Date(b.closedAt || 0).getTime())) {
      cumulative += t.profit || 0
      if (cumulative > peak) peak = cumulative
      const drawdown = peak - cumulative
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
    }

    const biggestWin = wins.length > 0 ? Math.max(...wins.map(t => t.profit || 0)) : 0
    const biggestLoss = losses.length > 0 ? Math.min(...losses.map(t => t.profit || 0)) : 0
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + (t.profit || 0), 0) / wins.length : 0
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + (t.profit || 0), 0) / losses.length : 0

    const mistakes: string[] = []
    const recommendations: string[] = []

    if (winRate < 40) {
      mistakes.push(`Win rate is low: ${winRate.toFixed(1)}%`)
      recommendations.push('Consider tightening entry signals - wait for higher RSI extremes or stronger volume confirmation')
    }

    if (profitFactor < 1) {
      mistakes.push(`Profit factor is below 1: ${profitFactor.toFixed(2)}`)
      recommendations.push('Increase take-profit distance or reduce stop-loss distance')
    }

    if (avgWin > 0 && avgLoss < 0 && Math.abs(avgLoss) > Math.abs(avgWin)) {
      mistakes.push('Average loss is larger than average win')
      recommendations.push('Consider wider stop-loss or narrower take-profit')
    }

    const consecutiveLosses = this.findConsecutiveLosses(recentTrades)
    if (consecutiveLosses >= 3) {
      mistakes.push(`Reached ${consecutiveLosses} consecutive losses`)
      recommendations.push('Implement a cooldown period after 3 consecutive losses')
    }

    if (recentTrades.length < 10) {
      recommendations.push('Not enough trades for reliable analysis. Continue running.')
    }

    const review: ReviewRecord = {
      id: uuidv4(),
      timestamp: now.toISOString(),
      period: {
        from: since.toISOString(),
        to: now.toISOString(),
      },
      totalTrades: recentTrades.length,
      winTrades: wins.length,
      lossTrades: losses.length,
      winRate,
      totalProfit: grossProfit,
      totalLoss: grossLoss,
      netProfit,
      biggestWin,
      biggestLoss,
      averageProfit: avgWin,
      averageLoss: avgLoss,
      mistakes,
      recommendations,
      metrics: {
        sharpeRatio,
        maxDrawdown,
        profitFactor,
      },
    }

    storage.saveReview(review)

    console.log('=== REVIEW RESULT ===')
    console.log(`Period: ${review.period.from} -> ${review.period.to}`)
    console.log(`Trades: ${recentTrades.length} | Win Rate: ${winRate.toFixed(1)}% | Net P/L: ${netProfit.toFixed(2)} USDT`)
    console.log(`Sharpe: ${sharpeRatio.toFixed(2)} | Max DD: ${maxDrawdown.toFixed(2)} | PF: ${profitFactor.toFixed(2)}`)
    if (mistakes.length > 0) {
      console.log('Mistakes found:')
      mistakes.forEach(m => console.log(`  - ${m}`))
    }
    if (recommendations.length > 0) {
      console.log('Recommendations:')
      recommendations.forEach(r => console.log(`  - ${r}`))
    }
    console.log('=====================')

    return review
  }

  private findConsecutiveLosses(trades: TradeRecord[]): number {
    const sorted = trades.sort(
      (a, b) => new Date(a.closedAt || 0).getTime() - new Date(b.closedAt || 0).getTime()
    )
    let maxConsecutive = 0
    let current = 0
    for (const t of sorted) {
      if ((t.profit || 0) < 0) {
        current++
        if (current > maxConsecutive) maxConsecutive = current
      } else {
        current = 0
      }
    }
    return maxConsecutive
  }
}
