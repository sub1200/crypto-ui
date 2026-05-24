import { ExchangeConnector } from '../exchange/connector'
import { Signal, calculateATR, calculateRSI, calculateEMA, averageVolume } from './types'

export type { Signal }

export class MeanReversionStrategy {
  async analyze(connector: ExchangeConnector, symbol: string): Promise<Signal | null> {
    try {
      const [candles5m, candles1m] = await Promise.all([
        connector.fetchOHLCV(symbol, '5m', 100),
        connector.fetchOHLCV(symbol, '1m', 50),
      ])

      if (candles5m.length < 40 || candles1m.length < 20) return null

      const rsi5m = calculateRSI(candles5m, 14)
      const ema50_5m = calculateEMA(candles5m, 50)
      const ema200_5m = calculateEMA(candles5m, 200)
      const last5m = candles5m[candles5m.length - 1]
      const price = last5m.close
      const atr5m = calculateATR(candles5m, 14)
      const avgVol5m = averageVolume(candles5m, 20)

      if (last5m.volume < avgVol5m * 0.6) return null

      // Check for oversold condition (BUY)
      if (rsi5m < 35 && price < ema50_5m * 0.995) {
        // Must be above long-term EMA200 (not in free fall)
        if (price < ema200_5m * 0.97) return null

        // 1m confirmation: first green after red
        const last1m = candles1m[candles1m.length - 1]
        const prev1m = candles1m[candles1m.length - 2]
        if (last1m.close <= last1m.open) return null
        if (prev1m.close > prev1m.open && last1m.close < prev1m.high) return null

        // Volume confirmation on 1m
        const avgVol1m = averageVolume(candles1m, 10)
        if (last1m.volume < avgVol1m * 0.8) return null

        let confidence = 55
        if (rsi5m < 25) confidence += 15
        else if (rsi5m < 30) confidence += 10
        if (last5m.volume > avgVol5m * 1.5) confidence += 10
        if (last1m.volume > avgVol1m * 1.5) confidence += 10
        confidence = Math.min(confidence, 90)

        if (confidence < 50) return null

        const slPct = Math.min(((atr5m * 1.2) / price) * 100, 1.5)
        const tpPct = Math.min(((atr5m * 2.4) / price) * 100, 3.0)

        return {
          symbol,
          side: 'buy',
          price: last1m.close,
          reason: `MEAN_REV_BUY | RSI_5m(${Math.round(rsi5m)}) | DEEP_DROP`,
          confidence,
          stopLossPct: -slPct,
          takeProfitPct: tpPct,
          strategy: 'mean-rev',
        }
      }

      // Check for overbought condition (SELL)
      if (rsi5m > 65 && price > ema50_5m * 1.005) {
        if (price > ema200_5m * 1.03) return null

        const last1m = candles1m[candles1m.length - 1]
        const prev1m = candles1m[candles1m.length - 2]
        if (last1m.close >= last1m.open) return null
        if (prev1m.close < prev1m.open && last1m.close > prev1m.low) return null

        const avgVol1m = averageVolume(candles1m, 10)
        if (last1m.volume < avgVol1m * 0.8) return null

        let confidence = 55
        if (rsi5m > 75) confidence += 15
        else if (rsi5m > 70) confidence += 10
        if (last5m.volume > avgVol5m * 1.5) confidence += 10
        if (last1m.volume > avgVol1m * 1.5) confidence += 10
        confidence = Math.min(confidence, 90)

        if (confidence < 50) return null

        const slPct = Math.min(((atr5m * 1.2) / price) * 100, 1.5)
        const tpPct = Math.min(((atr5m * 2.4) / price) * 100, 3.0)

        return {
          symbol,
          side: 'sell',
          price: last1m.close,
          reason: `MEAN_REV_SELL | RSI_5m(${Math.round(rsi5m)}) | SPIKE`,
          confidence,
          stopLossPct: slPct,
          takeProfitPct: -tpPct,
          strategy: 'mean-rev',
        }
      }

      return null
    } catch (error) {
      console.error(`[MeanRev] Error ${symbol}:`, error)
      return null
    }
  }
}
