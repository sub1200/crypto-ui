import { BotConfig } from '../config'
import { ExchangeConnector } from '../exchange/connector'
import { TradeRecord } from '../storage/storage'

export class RiskManager {
  private config: BotConfig['risk']
  private connector: ExchangeConnector
  private openTrades: TradeRecord[]

  constructor(config: BotConfig['risk'], connector: ExchangeConnector, openTrades: TradeRecord[]) {
    this.config = config
    this.connector = connector
    this.openTrades = openTrades
  }

  refresh(openTrades: TradeRecord[]) {
    this.openTrades = openTrades
  }

  canOpenNewTrade(): { allowed: boolean; reason: string } {
    if (this.openTrades.length >= this.config.maxOpenTrades) {
      return { allowed: false, reason: `Max open trades reached (${this.config.maxOpenTrades})` }
    }
    return { allowed: true, reason: '' }
  }

  calculatePositionSize(balance: number, price: number): number {
    const maxCapital = balance * (this.config.maxCapitalPercentPerTrade / 100)
    const amount = maxCapital / price
    return amount
  }

  calculateStopLoss(entryPrice: number, side: 'buy' | 'sell'): number {
    if (side === 'buy') {
      return entryPrice * (1 - this.config.stopLossPercent / 100)
    }
    return entryPrice * (1 + this.config.stopLossPercent / 100)
  }

  calculateTakeProfit(entryPrice: number, side: 'buy' | 'sell'): number {
    if (side === 'buy') {
      return entryPrice * (1 + this.config.takeProfitPercent / 100)
    }
    return entryPrice * (1 - this.config.takeProfitPercent / 100)
  }

  async checkStopLosses(trades: TradeRecord[]): Promise<TradeRecord[]> {
    const toClose: TradeRecord[] = []
    for (const trade of trades) {
      if (trade.status !== 'open' || !trade.stopLoss) continue
      try {
        const ticker = await this.connector.fetchTicker(trade.symbol)
        const currentPrice = ticker.last || 0
        if (trade.side === 'buy' && currentPrice <= trade.stopLoss) {
          toClose.push(trade)
        } else if (trade.side === 'sell' && currentPrice >= trade.stopLoss) {
          toClose.push(trade)
        }
      } catch (e) {
        console.error(`Error checking stop-loss for ${trade.symbol}:`, e)
      }
    }
    return toClose
  }

  async checkTakeProfits(trades: TradeRecord[]): Promise<TradeRecord[]> {
    const toClose: TradeRecord[] = []
    for (const trade of trades) {
      if (trade.status !== 'open' || !trade.takeProfit) continue
      try {
        const ticker = await this.connector.fetchTicker(trade.symbol)
        const currentPrice = ticker.last || 0
        if (trade.side === 'buy' && currentPrice >= trade.takeProfit) {
          toClose.push(trade)
        } else if (trade.side === 'sell' && currentPrice <= trade.takeProfit) {
          toClose.push(trade)
        }
      } catch (e) {
        console.error(`Error checking take-profit for ${trade.symbol}:`, e)
      }
    }
    return toClose
  }
}
