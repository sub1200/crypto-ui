import { Candle, ExchangeConnector } from '../exchange/connector'
import { BotConfig } from '../config'
import { Signal, calculateATR, calculateRSI, calculateEMA, averageVolume } from './types'

export type { Signal }

export class ScalpingStrategy {
  private config: BotConfig['strategy']['scalper']

  constructor(config: BotConfig['strategy']['scalper']) {
    this.config = config
  }

  private isBlacklisted(symbol: string): boolean {
    return this.config.blacklist.some(b => symbol.startsWith(b) || symbol.includes(b))
  }

  async analyze(connector: ExchangeConnector, symbol: string): Promise<Signal | null> {
    try {
      if (this.isBlacklisted(symbol)) return null

      const [candles15m, candles5m, candles1m] = await Promise.all([
        connector.fetchOHLCV(symbol, '15m', 100),
        connector.fetchOHLCV(symbol, '5m', 100),
        connector.fetchOHLCV(symbol, '1m', 50),
      ])

      if (candles15m.length < 60 || candles5m.length < 30 || candles1m.length < 20) return null

      const ema50_15m = calculateEMA(candles15m, 50)
      const ema200_15m = calculateEMA(candles15m, 200)
      const price15m = candles15m[candles15m.length - 1].close

      const uptrend = price15m > ema50_15m && ema50_15m > ema200_15m * 0.98
      const downtrend = price15m < ema50_15m && ema50_15m < ema200_15m * 1.02
      if (!uptrend && !downtrend) return null

      const rsi5m = calculateRSI(candles5m, 14)
      const ema20_5m = calculateEMA(candles5m, 20)
      const ema50_5m = calculateEMA(candles5m, 50)
      const last5m = candles5m[candles5m.length - 1]
      const atr5m = calculateATR(candles5m, 14)
      const avgVol5m = averageVolume(candles5m, 20)

      if (last5m.volume < avgVol5m * 0.5) return null

      const side = uptrend ? 'buy' : 'sell'

      if (side === 'buy') {
        if (rsi5m >= 50 || rsi5m <= 25) return null
        if (last5m.close > ema20_5m * 1.005) return null
        if (last5m.close < ema50_5m) return null
      } else {
        if (rsi5m <= 50 || rsi5m >= 75) return null
        if (last5m.close < ema20_5m * 0.995) return null
        if (last5m.close > ema50_5m) return null
      }

      const last1m = candles1m[candles1m.length - 1]
      const ema5_1m = calculateEMA(candles1m, 5)

      if (side === 'buy') {
        if (last1m.close < last1m.open && last1m.close < candles1m[candles1m.length - 2].close) return null
        if (last1m.close < ema5_1m) return null
      } else {
        if (last1m.close > last1m.open && last1m.close > candles1m[candles1m.length - 2].close) return null
        if (last1m.close > ema5_1m) return null
      }

      let confidence = 50
      if (side === 'buy') {
        if (rsi5m < 35) confidence += 15
        else if (rsi5m < 42) confidence += 10
        else confidence += 5
      } else {
        if (rsi5m > 65) confidence += 15
        else if (rsi5m > 58) confidence += 10
        else confidence += 5
      }
      if (last5m.volume > avgVol5m * 1.5) confidence += 10
      if (last1m.volume > averageVolume(candles1m, 10) * 1.5) confidence += 10
      if (uptrend && ema20_5m > ema50_5m) confidence += 10
      if (downtrend && ema20_5m < ema50_5m) confidence += 10
      confidence = Math.min(confidence, 95)
      if (confidence < this.config.minConfidence) return null

      const slDistPct = ((atr5m * this.config.atrSlMultiplier) / last5m.close) * 100
      const tpDistPct = ((atr5m * this.config.atrTpMultiplier) / last5m.close) * 100
      const cappedSl = Math.min(slDistPct, 2.0)
      const cappedTp = Math.min(tpDistPct, 4.0)

      return {
        symbol,
        side,
        price: last5m.close,
        reason: `TREND_${side === 'buy' ? 'BUY' : 'SELL'} | RSI_5m(${Math.round(rsi5m)})`,
        confidence,
        stopLossPct: side === 'buy' ? -cappedSl : cappedSl,
        takeProfitPct: side === 'buy' ? cappedTp : -cappedTp,
        strategy: 'trend',
      }
    } catch (error) {
      console.error(`[Trend] Error ${symbol}:`, error)
      return null
    }
  }
}
