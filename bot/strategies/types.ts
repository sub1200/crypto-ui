import { Candle } from '../exchange/connector'

export interface Signal {
  symbol: string
  side: 'buy' | 'sell'
  price: number
  reason: string
  confidence: number
  stopLossPct?: number
  takeProfitPct?: number
  strategy: string
}

export function calculateATR(candles: Candle[], period: number): number {
  const ranges = candles.slice(-period).map(c => c.high - c.low)
  return ranges.reduce((s, r) => s + r, 0) / ranges.length
}

export function calculateRSI(candles: Candle[], period: number): number {
  if (candles.length < period + 1) return 50
  let avgGain = 0, avgLoss = 0
  for (let i = candles.length - period; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close
    if (change > 0) avgGain += change
    else avgLoss += Math.abs(change)
  }
  avgGain /= period
  avgLoss /= period
  if (avgLoss === 0) return 100
  return 100 - 100 / (1 + avgGain / avgLoss)
}

export function calculateEMA(candles: Candle[], period: number): number {
  if (candles.length < period) return candles[candles.length - 1].close
  const multiplier = 2 / (period + 1)
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
  for (let i = period; i < candles.length; i++) {
    ema = (candles[i].close - ema) * multiplier + ema
  }
  return ema
}

export function averageVolume(candles: Candle[], period: number): number {
  return candles.slice(-period).reduce((s, c) => s + c.volume, 0) / period
}
