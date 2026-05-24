import type { BotConfig } from '../config'

type CandleTuple = [number, number, number, number, number, number]

export type Candle = {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export class ExchangeConnector {
  private exchange: any
  private config: BotConfig['exchange']

  constructor(config: BotConfig['exchange']) {
    this.config = config
    const ccxt = require('ccxt')
    this.exchange = new ccxt.binance({
      apiKey: config.apiKey,
      secret: config.secret,
      enableRateLimit: true,
      rateLimit: config.rateLimit,
    })
    if (config.testnet) {
      this.exchange.setSandboxMode(true)
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.exchange.fetchBalance()
      return true
    } catch {
      return false
    }
  }

  async fetchBalance(): Promise<{ free: Record<string, number>; used: Record<string, number>; total: Record<string, number> }> {
    const balance = await this.exchange.fetchBalance()
    return balance
  }

  async fetchTicker(symbol: string) {
    return this.exchange.fetchTicker(symbol)
  }

  async fetchOHLCV(symbol: string, timeframe: string = '5m', limit: number = 100): Promise<Candle[]> {
    const ohlcv: CandleTuple[] = await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit)
    return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    }))
  }

  async fetchOrderBook(symbol: string, limit: number = 20) {
    return this.exchange.fetchOrderBook(symbol, limit)
  }

  async createLimitBuyOrder(symbol: string, amount: number, price: number) {
    return this.exchange.createLimitBuyOrder(symbol, amount, price)
  }

  async createLimitSellOrder(symbol: string, amount: number, price: number) {
    return this.exchange.createLimitSellOrder(symbol, amount, price)
  }

  async createMarketBuyOrder(symbol: string, amount: number) {
    return this.exchange.createMarketBuyOrder(symbol, amount)
  }

  async createMarketSellOrder(symbol: string, amount: number) {
    return this.exchange.createMarketSellOrder(symbol, amount)
  }

  async createStopLossOrder(symbol: string, amount: number, stopPrice: number, side: 'buy' | 'sell') {
    return this.exchange.createOrder(symbol, 'stop_loss_limit', side, amount, undefined, { stopPrice })
  }

  async cancelOrder(id: string, symbol: string) {
    return this.exchange.cancelOrder(id, symbol)
  }

  async fetchOpenOrders(symbol?: string) {
    return this.exchange.fetchOpenOrders(symbol)
  }

  async fetchOrder(id: string, symbol: string) {
    return this.exchange.fetchOrder(id, symbol)
  }

  getMinAmount(symbol: string): number {
    const market = this.exchange.markets[symbol]
    return market?.limits?.amount?.min || 0.001
  }

  getAmountPrecision(symbol: string): number {
    const market = this.exchange.markets[symbol]
    return market?.precision?.amount || 8
  }

  getPricePrecision(symbol: string): number {
    const market = this.exchange.markets[symbol]
    return market?.precision?.price || 8
  }

  roundAmount(symbol: string, amount: number): number {
    const precision = this.getAmountPrecision(symbol)
    return parseFloat(amount.toFixed(precision))
  }

  roundPrice(symbol: string, price: number): number {
    const precision = this.getPricePrecision(symbol)
    return parseFloat(price.toFixed(precision))
  }
}
