import { ExchangeConnector } from '../exchange/connector'
import { Signal, calculateATR, calculateRSI, calculateEMA, averageVolume } from './types'

export type { Signal }

export class MomentumStrategy {
  async analyze(connector: ExchangeConnector, symbol: string): Promise<Signal | null> {
    try {
      const [candles5m, candles1m] = await Promise.all([
        connector.fetchOHLCV(symbol, '5m', 100),
        connector.fetchOHLCV(symbol, '1m', 30),
      ])

      if (candles5m.length < 30 || candles1m.length < 10) return null

      const last5m = candles5m[candles5m.length - 1]
      const prev5m = candles5m[candles5m.length - 2]
      const price = last5m.close
      const atr5m = calculateATR(candles5m, 14)
      const avgVol5m = averageVolume(candles5m, 20)

      if (last5m.volume < avgVol5m * 1.3) return null

      const body5m = Math.abs(last5m.close - last5m.open)
      const bodyPct5m = (body5m / last5m.open) * 100

      if (bodyPct5m < 0.15) return null

      const green5m = last5m.close > last5m.open
      const red5m = last5m.close < last5m.open

      // Momentum BUY: green 5m candle with volume + price expanding
      if (green5m && last5m.close > prev5m.close) {
        // Check 1m momentum continuation
        const last1m = candles1m[candles1m.length - 1]
        const prev1m = candles1m[candles1m.length - 2]

        if (last1m.close < last1m.open) return null
        if (last1m.close < prev1m.close && prev1m.close > prev1m.open) return null

        const rsi5m = calculateRSI(candles5m, 14)
        if (rsi5m > 75) return null

        let confidence = 50
        if (bodyPct5m > 0.3) confidence += 15
        else if (bodyPct5m > 0.2) confidence += 10
        if (last5m.volume > avgVol5m * 2) confidence += 10
        if (last1m.volume > averageVolume(candles1m, 10) * 1.3) confidence += 10
        confidence = Math.min(confidence, 90)

        if (confidence < 50) return null

        const slPct = Math.min(((atr5m * 1.0) / price) * 100, 1.0)
        const tpPct = Math.min(((atr5m * 2.0) / price) * 100, 2.5)

        return {
          symbol,
          side: 'buy',
          price: last1m.close,
          reason: `MOMENTUM_BUY | BODY(${bodyPct5m.toFixed(2)}%) | VOL`,
          confidence,
          stopLossPct: -slPct,
          takeProfitPct: tpPct,
          strategy: 'momentum',
        }
      }

      // Momentum SELL
      if (red5m && last5m.close < prev5m.close) {
        const last1m = candles1m[candles1m.length - 1]
        const prev1m = candles1m[candles1m.length - 2]

        if (last1m.close > last1m.open) return null
        if (last1m.close > prev1m.close && prev1m.close < prev1m.open) return null

        const rsi5m = calculateRSI(candles5m, 14)
        if (rsi5m < 25) return null

        let confidence = 50
        if (bodyPct5m > 0.3) confidence += 15
        else if (bodyPct5m > 0.2) confidence += 10
        if (last5m.volume > avgVol5m * 2) confidence += 10
        if (last1m.volume > averageVolume(candles1m, 10) * 1.3) confidence += 10
        confidence = Math.min(confidence, 90)

        if (confidence < 50) return null

        const slPct = Math.min(((atr5m * 1.0) / price) * 100, 1.0)
        const tpPct = Math.min(((atr5m * 2.0) / price) * 100, 2.5)

        return {
          symbol,
          side: 'sell',
          price: last1m.close,
          reason: `MOMENTUM_SELL | BODY(${bodyPct5m.toFixed(2)}%) | VOL`,
          confidence,
          stopLossPct: slPct,
          takeProfitPct: -tpPct,
          strategy: 'momentum',
        }
      }

      return null
    } catch (error) {
      console.error(`[Momentum] Error ${symbol}:`, error)
      return null
    }
  }
}
