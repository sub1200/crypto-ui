import { ExchangeConnector, Candle } from '../exchange/connector'
import { BotConfig } from '../config'

export interface SignalSyncSignal {
  id: string
  pair: string
  signalType: 'LONG' | 'SHORT'
  entryPrice: number
  signalScore: number
  starRating: number
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  hasVolumeSpike: boolean
  isExplosive: boolean
  volatilityScore: number
  priceChange24h: number
  openInterestChangePct: number
  targetProfit1Pct: number
  targetProfit2Pct: number
  stopLossPct: number
  marketTrend: string
  phase: string
  quoteVolume: number
}

export type ValidationResult = 'confirmed' | 'rejected' | 'skip'

export interface ValidatedSignal {
  signal: SignalSyncSignal
  validation: ValidationResult
  reasons: string[]
  confidence: number
}

function calculateRSI(candles: Candle[], period: number): number {
  if (candles.length < period + 1) return 50
  const changes: number[] = []
  for (let i = candles.length - period; i < candles.length; i++) {
    changes.push(candles[i].close - candles[i - 1].close)
  }
  let avgGain = 0
  let avgLoss = 0
  for (const c of changes) {
    if (c > 0) avgGain += c
    else avgLoss += Math.abs(c)
  }
  avgGain /= period
  avgLoss /= period
  if (avgLoss === 0) return 100
  return 100 - 100 / (1 + avgGain / avgLoss)
}

export class SignalSyncConnector {
  private apiUrl: string
  private minScore: number
  private minVolume: number

  constructor(config: BotConfig['signalsync']) {
    this.apiUrl = config.apiUrl
    this.minScore = config.minSignalScore
    this.minVolume = config.minQuoteVolume
  }

  async fetchSignals(): Promise<SignalSyncSignal[]> {
    try {
      const res = await fetch(this.apiUrl, { signal: AbortSignal.timeout(10000) })
      const data = await res.json()
      if (!data.success || !Array.isArray(data.signals)) return []
      return data.signals
    } catch (e) {
      console.error('[SignalSync] Failed to fetch signals:', e)
      return []
    }
  }

  async validate(signal: SignalSyncSignal, connector: ExchangeConnector): Promise<ValidatedSignal> {
    const reasons: string[] = []
    let score = 0

    // 1. Signal score check
    if (signal.signalScore >= this.minScore) {
      score += 15
      reasons.push(`High signal score: ${signal.signalScore}`)
    } else {
      reasons.push(`Low signal score: ${signal.signalScore} < ${this.minScore}`)
      return { signal, validation: 'rejected', reasons, confidence: 0 }
    }

    // 2. Volume check
    if (signal.quoteVolume >= this.minVolume) {
      score += 10
      reasons.push(`Volume OK: ${(signal.quoteVolume / 1e6).toFixed(1)}M`)
    } else {
      score -= 10
      reasons.push(`Low volume: ${(signal.quoteVolume / 1e6).toFixed(1)}M`)
    }

    // 3. Volume spike bonus
    if (signal.hasVolumeSpike) {
      score += 10
      reasons.push('Volume spike detected')
    }

    // 4. Explosive signal bonus
    if (signal.isExplosive) {
      score += 15
      reasons.push('Explosive signal')
    }

    // 5. RSI confirmation from our own analysis
    try {
      const candles = await connector.fetchOHLCV(signal.pair, '5m', 30)
      if (candles.length >= 14) {
        const rsi = calculateRSI(candles, 14)
        const currentCandle = candles[candles.length - 1]
        const greenCandle = currentCandle.close > currentCandle.open
        const avgVol = candles.reduce((s, c) => s + c.volume, 0) / candles.length

        if (signal.signalType === 'LONG') {
          if (rsi < 70) {
            score += 15
            reasons.push(`RSI ${rsi.toFixed(0)} - room for upside`)
          }
          if (rsi < 40) {
            score += 10
            reasons.push(`RSI ${rsi.toFixed(0)} - oversold bounce potential`)
          }
          if (greenCandle) {
            score += 10
            reasons.push('Current candle is green')
          }
          if (currentCandle.volume > avgVol * 1.2) {
            score += 10
            reasons.push('High volume on our timeframe')
          }
        } else {
          if (rsi > 30) {
            score += 15
            reasons.push(`RSI ${rsi.toFixed(0)} - room for downside`)
          }
          if (rsi > 60) {
            score += 10
            reasons.push(`RSI ${rsi.toFixed(0)} - overbought`)
          }
          if (!greenCandle) {
            score += 10
            reasons.push('Current candle is red')
          }
          if (currentCandle.volume > avgVol * 1.2) {
            score += 10
            reasons.push('High volume on our timeframe')
          }
        }
      }
    } catch {
      reasons.push('Could not verify RSI')
    }

    // 6. Market trend alignment
    if (signal.marketTrend === 'Bullish' && signal.signalType === 'LONG') {
      score += 10
      reasons.push('Trend aligned: Bullish')
    } else if (signal.marketTrend === 'Bearish' && signal.signalType === 'SHORT') {
      score += 10
      reasons.push('Trend aligned: Bearish')
    }

    // 7. Risk level consideration
    if (signal.riskLevel === 'HIGH') {
      score -= 5
      reasons.push(`High risk: ${signal.riskLevel}`)
    }

    // 8. 24h price change - don't buy after huge pump
    if (signal.priceChange24h > 30 && signal.signalType === 'LONG') {
      score -= 15
      reasons.push(`Already pumped ${signal.priceChange24h.toFixed(0)}% in 24h`)
    }

    const finalScore = Math.max(0, Math.min(100, score))
    const validation: ValidationResult = finalScore >= 50 ? 'confirmed' : 'rejected'

    if (finalScore >= 70) {
      reasons.push(`STRONG: ${finalScore}/100`)
    } else if (finalScore >= 50) {
      reasons.push(`CONFIRMED: ${finalScore}/100`)
    } else {
      reasons.push(`REJECTED: ${finalScore}/100 - insufficient confirmation`)
    }

    return { signal, validation, reasons, confidence: finalScore }
  }
}
