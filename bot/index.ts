import * as dotenv from 'dotenv'
dotenv.config()

import { defaultConfig, BotConfig } from './config'
import { ExchangeConnector } from './exchange/connector'
import { JsonStorage, TradeRecord } from './storage/storage'
import { ScalpingStrategy } from './strategies/scalper'
import { MeanReversionStrategy } from './strategies/mean-reversion'
import { MomentumStrategy } from './strategies/momentum'
import { Signal } from './strategies/types'
import { RiskManager } from './risk/manager'
import { ReviewAgent } from './review/agent'
import { SignalSyncConnector } from './signalsync/connector'
import { v4 as uuidv4 } from 'uuid'

class TradingBot {
  private config: BotConfig
  private exchange!: ExchangeConnector
  private storage: JsonStorage
  private trendStrat = new ScalpingStrategy(defaultConfig.strategy.scalper)
  private meanRevStrat = new MeanReversionStrategy()
  private momentumStrat = new MomentumStrategy()
  private strategies: Array<{ name: string; analyze: (connector: ExchangeConnector, symbol: string) => Promise<Signal | null> }>
  private risk!: RiskManager
  private reviewAgent: ReviewAgent
  private signalSync: SignalSyncConnector
  private running: boolean = false
  private lastReviewTime: number = 0
  private lastSignalSyncCheck: number = 0
  private processedSignalIds: Set<string> = new Set()
  private signalSyncPairs: Set<string> = new Set()

  constructor() {
    this.config = { ...defaultConfig }
    this.config.exchange.apiKey = process.env.BINANCE_TESTNET_API_KEY || ''
    this.config.exchange.secret = process.env.BINANCE_TESTNET_SECRET || ''

    this.storage = new JsonStorage()
    this.strategies = [
      { name: 'trend', analyze: (c, s) => this.trendStrat.analyze(c, s) },
      { name: 'mean-rev', analyze: (c, s) => this.meanRevStrat.analyze(c, s) },
      { name: 'momentum', analyze: (c, s) => this.momentumStrat.analyze(c, s) },
    ]
    this.reviewAgent = new ReviewAgent(this.config.review)
    this.signalSync = new SignalSyncConnector(this.config.signalsync)
  }

  async start() {
    if (this.running) {
      console.log('Bot is already running')
      return
    }

    console.log('Starting trading bot...')
    this.exchange = new ExchangeConnector(this.config.exchange)

    const connected = await this.exchange.testConnection()
    if (!connected) {
      console.error('Failed to connect to exchange. Check your API keys.')
      this.storage.updateBotState({ running: false })
      return
    }

    const balance = await this.exchange.fetchBalance()
    console.log('Connected to Binance Testnet!')
    console.log('Balance:', JSON.stringify(balance.total, null, 2))

    const totalUSD = Object.entries(balance.total)
      .filter(([_, v]) => typeof v === 'number')
      .reduce((sum, [_, v]) => sum + (v as number), 0)

    if (totalUSD < this.config.risk.minBalance) {
      console.warn(`Balance too low: ${totalUSD} USDT. Need at least ${this.config.risk.minBalance}`)
    }

    this.running = true
    this.storage.updateBotState({ running: true, startedAt: new Date().toISOString() })
    this.lastReviewTime = Date.now()

    console.log('Bot is now running. Scanning for signals...')
    await this.mainLoop()
  }

  stop() {
    this.running = false
    this.storage.updateBotState({ running: false })
    console.log('Bot stopped.')
  }

  private async mainLoop() {
    while (this.running) {
      try {
        await this.processExternalSignals()
        await this.checkSignalSyncSignals()
        await this.checkSignals()
        await this.manageOpenTrades()
        await this.checkReviewSchedule()
      } catch (error) {
        console.error('Error in main loop:', error)
      }

      const bal = await this.exchange.fetchBalance()
      const usdtBal = (bal.total['USDT'] || 0) as number
      this.storage.updateBotState({ lastCheck: new Date().toISOString(), balance: usdtBal })
      await this.sleep(this.config.bot.checkIntervalMs)
    }
  }

  private async checkSignals() {
    const openTrades = this.storage.getOpenTrades()
    const todaysTrades = this.storage.getTodayTrades()

    if (todaysTrades.length >= this.config.risk.maxDailyTrades) {
      return
    }

    const riskResult = new RiskManager(this.config.risk, this.exchange, openTrades).canOpenNewTrade()
    if (!riskResult.allowed) {
      return
    }

    const availableSlots = this.config.risk.maxOpenTrades - openTrades.length
    if (availableSlots <= 0) return

    // Scan both configured pairs AND hot pairs from SignalSync
    const scanPairs = [...new Set([
      ...this.config.strategy.scalper.pairs,
      ...Array.from(this.signalSyncPairs),
    ])]

    const foundSignals: Array<{
      symbol: string
      side: 'buy' | 'sell'
      price: number
      reason: string
      confidence: number
      stopLossPct?: number
      takeProfitPct?: number
    }> = []

    for (const pair of scanPairs) {
      if (!this.running) break
      if (openTrades.some(t => t.symbol === pair && t.status === 'open')) continue
      if (foundSignals.some(s => s.symbol === pair)) continue

      // Run ALL strategies on this pair
      for (const strat of this.strategies) {
        if (!this.running) break
        try {
          const signal = await strat.analyze(this.exchange, pair)
          if (!signal) continue

          console.log(`[${strat.name.toUpperCase()}] ${pair}: ${signal.side.toUpperCase()} | ${signal.confidence}% | ${signal.reason}`)

          if (signal.confidence >= this.config.strategy.scalper.minConfidence) {
            foundSignals.push({
              symbol: signal.symbol,
              side: signal.side,
              price: signal.price,
              reason: `[${strat.name}] ${signal.reason}`,
              confidence: signal.confidence,
              stopLossPct: signal.stopLossPct,
              takeProfitPct: signal.takeProfitPct,
            })
          }
        } catch (error) {
          console.error(`[${strat.name}] Error ${pair}:`, error)
        }
      }
    }

    // Rank by confidence, execute best ones up to available slots
    foundSignals.sort((a, b) => b.confidence - a.confidence)

    // Deduplicate: if multiple strategies signal the same pair, keep highest confidence
    const seen = new Set<string>()
    const deduped = foundSignals.filter(s => {
      if (seen.has(s.symbol)) return false
      seen.add(s.symbol)
      return true
    })

    const toExecute = deduped.slice(0, availableSlots)

    if (toExecute.length > 0) {
      console.log(`[SIGNALS] ${foundSignals.length} signals from all strategies. Executing top ${toExecute.length}: ${toExecute.map(s => `${s.symbol}(${s.confidence})`).join(', ')}`)
      for (const s of toExecute) {
        if (!this.running) break
        await this.executeTrade(s)
      }
    }
  }

  private async executeTrade(signal: {
    symbol: string
    side: 'buy' | 'sell'
    price: number
    reason: string
    confidence: number
    stopLossPct?: number
    takeProfitPct?: number
  }) {
    try {
      const balance = await this.exchange.fetchBalance()
      const usdtBalance = (balance.total['USDT'] || 0) as number

      if (usdtBalance < this.config.risk.minBalance) {
        console.log(`Insufficient USDT balance: ${usdtBalance}`)
        return
      }

      const positionSize = new RiskManager(this.config.risk, this.exchange, [])
        .calculatePositionSize(usdtBalance, signal.price)

      const stopLoss = signal.stopLossPct
        ? signal.price * (1 + signal.stopLossPct / 100)
        : new RiskManager(this.config.risk, this.exchange, []).calculateStopLoss(signal.price, signal.side)

      const takeProfit = signal.takeProfitPct
        ? signal.price * (1 + signal.takeProfitPct / 100)
        : new RiskManager(this.config.risk, this.exchange, []).calculateTakeProfit(signal.price, signal.side)

      const amount = this.exchange.roundAmount(signal.symbol, positionSize)

      if (amount <= 0) {
        console.log(`Invalid amount for ${signal.symbol}: ${amount}`)
        return
      }

      let order
      if (signal.side === 'buy') {
        order = await this.exchange.createMarketBuyOrder(signal.symbol, amount)
      } else {
        order = await this.exchange.createMarketSellOrder(signal.symbol, amount)
      }

      const strategy = signal.reason.startsWith('SignalSync') ? 'signalsync' : 'scalper'

      const trade: TradeRecord = {
        id: uuidv4(),
        symbol: signal.symbol,
        side: signal.side,
        entryPrice: signal.price,
        exitPrice: null,
        amount,
        totalCost: amount * signal.price,
        profit: null,
        profitPercent: null,
        status: 'open',
        strategy,
        reason: signal.reason,
        stopLoss,
        takeProfit,
        openedAt: new Date().toISOString(),
        closedAt: null,
        duration: null,
        fee: null,
      }

      this.storage.saveTrade(trade)
      console.log(`TRADE OPENED: ${signal.side.toUpperCase()} ${signal.symbol} @ ${signal.price} | Size: ${trade.totalCost.toFixed(2)} USDT | SL: ${stopLoss} | TP: ${takeProfit}`)
      console.log(`Strategy: ${strategy} | Reason: ${signal.reason}`)
    } catch (error) {
      console.error(`Failed to execute trade for ${signal.symbol}:`, error)
    }
  }

  private async processExternalSignals() {
    const pending = this.storage.getPendingExternalSignals()
    if (pending.length === 0) return

    const openTrades = this.storage.getOpenTrades()
    const todaysTrades = this.storage.getTodayTrades()
    if (todaysTrades.length >= this.config.risk.maxDailyTrades) {
      console.log(`Daily trade limit reached (${this.config.risk.maxDailyTrades}). Skipping external signals.`)
      return
    }

    const riskResult = new RiskManager(this.config.risk, this.exchange, openTrades).canOpenNewTrade()
    if (!riskResult.allowed) {
      console.log(`Risk manager: ${riskResult.reason}. Skipping external signals.`)
      return
    }

    for (const extSignal of pending) {
      if (!this.running) break
      if (openTrades.some(t => t.symbol === extSignal.symbol && t.status === 'open')) {
        console.log(`Already have open trade on ${extSignal.symbol}. Skipping external signal.`)
        this.storage.updateExternalSignal(extSignal.id, { status: 'failed', error: 'Duplicate symbol open' })
        continue
      }

      try {
        const balance = await this.exchange.fetchBalance()
        const usdtBalance = (balance.total['USDT'] || 0) as number

        if (usdtBalance < this.config.risk.minBalance) {
          this.storage.updateExternalSignal(extSignal.id, { status: 'failed', error: 'Insufficient balance' })
          continue
        }

        const riskAmount = usdtBalance * (this.config.risk.maxCapitalPercentPerTrade / 100)
        const amount = this.exchange.roundAmount(extSignal.symbol, riskAmount / extSignal.entryPrice)

        if (amount <= 0) {
          this.storage.updateExternalSignal(extSignal.id, { status: 'failed', error: 'Invalid amount' })
          continue
        }

        let order
        if (extSignal.side === 'buy') {
          order = await this.exchange.createMarketBuyOrder(extSignal.symbol, amount)
        } else {
          order = await this.exchange.createMarketSellOrder(extSignal.symbol, amount)
        }

        const trade: TradeRecord = {
          id: uuidv4(),
          symbol: extSignal.symbol,
          side: extSignal.side,
          entryPrice: extSignal.entryPrice,
          exitPrice: null,
          amount,
          totalCost: amount * extSignal.entryPrice,
          profit: null,
          profitPercent: null,
          status: 'open',
          strategy: 'external',
          reason: extSignal.reason,
          stopLoss: extSignal.stopLoss,
          takeProfit: extSignal.takeProfit,
          openedAt: new Date().toISOString(),
          closedAt: null,
          duration: null,
          fee: null,
        }

        this.storage.saveTrade(trade)
        this.storage.updateExternalSignal(extSignal.id, {
          status: 'executed',
          executedAt: new Date().toISOString(),
          tradeId: trade.id,
        })

        console.log(`[EXTERNAL] TRADE OPENED: ${extSignal.side.toUpperCase()} ${extSignal.symbol} @ ${extSignal.entryPrice} | Size: ${trade.totalCost.toFixed(2)} USDT | SL: ${extSignal.stopLoss} | TP: ${extSignal.takeProfit}`)
      } catch (error: any) {
        console.error(`[EXTERNAL] Failed to execute signal ${extSignal.id}:`, error)
        this.storage.updateExternalSignal(extSignal.id, {
          status: 'failed',
          error: error.message || 'Unknown error',
        })
      }
    }
  }

  private async checkSignalSyncSignals() {
    const now = Date.now()
    if (now - this.lastSignalSyncCheck < this.config.signalsync.checkIntervalMs) return
    this.lastSignalSyncCheck = now

    const openTrades = this.storage.getOpenTrades()

    // Reserve 1 slot for the bot's own independent analysis
    const reservedSlots = 1
    const signalSyncMaxSlots = this.config.risk.maxOpenTrades - reservedSlots
    const availableSlots = signalSyncMaxSlots - openTrades.length
    if (availableSlots <= 0) {
      console.log(`[SignalSync] Reserved ${reservedSlots} slot(s) for own analysis. Using ${openTrades.length}/${signalSyncMaxSlots}. Skipping.`)
      return
    }

    console.log('[SignalSync] Fetching signals...')
    const signals = await this.signalSync.fetchSignals()
    if (signals.length === 0) {
      console.log('[SignalSync] No signals received')
      return
    }
    console.log(`[SignalSync] Received ${signals.length} signals`)

    // Collect pairs from SignalSync for independent analysis later
    for (const s of signals) {
      this.signalSyncPairs.add(s.pair)
    }
    if (this.signalSyncPairs.size > 50) {
      const arr = Array.from(this.signalSyncPairs)
      this.signalSyncPairs = new Set(arr.slice(arr.length - 30))
    }

    interface Candidate {
      symbol: string
      side: 'buy' | 'sell'
      price: number
      stopLossPct: number
      takeProfitPct: number
      reason: string
      confidence: number
    }
    const candidates: Candidate[] = []

    for (const signal of signals) {
      if (!this.running) break
      if (this.processedSignalIds.has(signal.id)) continue

      if (openTrades.some(t => t.symbol === signal.pair && t.status === 'open')) {
        console.log(`[SignalSync] ${signal.pair}: already have open trade, skipping`)
        this.processedSignalIds.add(signal.id)
        continue
      }

      const result = await this.signalSync.validate(signal, this.exchange)
      console.log(`[SignalSync] ${signal.pair} (${signal.signalType}): [${result.validation.toUpperCase()}] ${result.confidence}/100`)

      result.reasons.forEach(r => console.log(`   - ${r}`))

      if (result.validation !== 'confirmed') {
        this.processedSignalIds.add(signal.id)
        continue
      }

      // Cross-check: run all bot's strategies on this pair
      let crossCheckScore = 0
      let crossCheckNote = ''
      let disagree = false
      const signalSide = signal.signalType === 'LONG' ? 'buy' : 'sell'

      for (const strat of this.strategies) {
        try {
          const ownSignal = await strat.analyze(this.exchange, signal.pair)
          if (!ownSignal) continue

          if (ownSignal.side === signalSide) {
            crossCheckScore = Math.max(crossCheckScore, Math.min(ownSignal.confidence, 30))
            crossCheckNote = ` | ${strat.name} agrees (${ownSignal.confidence}/100)`
            console.log(`   -> [${strat.name}] AGREE (${ownSignal.confidence}%, same direction)`)
          } else if (ownSignal.confidence >= this.config.strategy.scalper.minConfidence) {
            console.log(`   -> [${strat.name}] DISAGREE (${ownSignal.confidence}%, opposite) - REJECTING`)
            disagree = true
            break
          }
        } catch {
          // skip
        }
      }

      if (disagree) {
        this.processedSignalIds.add(signal.id)
        continue
      }

      const combinedConfidence = Math.min(result.confidence + crossCheckScore, 100)

      // Calculate volatility-adjusted SL/TP
      const volatilityMult = Math.max(1, Math.min(4, Math.abs(signal.priceChange24h || 0) / 10))
      const adjustedSL = this.config.risk.stopLossPercent * volatilityMult
      const adjustedTP = Math.max(
        this.config.risk.takeProfitPercent * volatilityMult,
        adjustedSL * 1.5
      )

      candidates.push({
        symbol: signal.pair,
        side: signal.signalType === 'LONG' ? 'buy' : 'sell',
        price: signal.entryPrice,
        stopLossPct: signal.signalType === 'LONG' ? -adjustedSL : adjustedSL,
        takeProfitPct: signal.signalType === 'LONG' ? adjustedTP : -adjustedTP,
        reason: `SignalSync: ${result.reasons.join(' | ')}${crossCheckNote}`,
        confidence: combinedConfidence,
      })

      this.processedSignalIds.add(signal.id)

      // Keep set from growing forever
      if (this.processedSignalIds.size > 1000) {
        const arr = Array.from(this.processedSignalIds)
        this.processedSignalIds = new Set(arr.slice(arr.length - 500))
      }
    }

    // Sort candidates by confidence descending, execute best ones
    candidates.sort((a, b) => b.confidence - a.confidence)
    console.log(`[SignalSync] Ranked ${candidates.length} candidates. Top: ${candidates[0]?.symbol || 'none'} (${candidates[0]?.confidence || 0}/100)`)

    const toExecute = candidates.slice(0, availableSlots)
    for (const c of toExecute) {
      if (!this.running) break
      console.log(`[SignalSync] Executing ${c.symbol} (${c.side}) - ranked #{${candidates.indexOf(c) + 1}} with ${c.confidence}/100`)
      await this.executeTrade(c)
    }
  }

  private async manageOpenTrades() {
    let openTrades = this.storage.getOpenTrades()
    if (openTrades.length === 0) return

    const riskManager = new RiskManager(this.config.risk, this.exchange, openTrades)

    const slTrades = await riskManager.checkStopLosses(openTrades)
    for (const trade of slTrades) {
      await this.closeTrade(trade, 'stop_loss')
    }

    openTrades = this.storage.getOpenTrades()
    const tpTrades = await riskManager.checkTakeProfits(openTrades)
    for (const trade of tpTrades) {
      await this.closeTrade(trade, 'take_profit')
    }
  }

  private async closeTrade(trade: TradeRecord, reason: string) {
    try {
      const ticker = await this.exchange.fetchTicker(trade.symbol)
      const currentPrice = ticker.last || 0

      let order
      if (trade.side === 'buy') {
        order = await this.exchange.createMarketSellOrder(trade.symbol, trade.amount)
      } else {
        order = await this.exchange.createMarketBuyOrder(trade.symbol, trade.amount)
      }

      const profit = (currentPrice - trade.entryPrice) * trade.amount * (trade.side === 'buy' ? 1 : -1)
      const profitPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100 * (trade.side === 'buy' ? 1 : -1)
      const fee = order.fee?.cost || 0

      const closedTrade: TradeRecord = {
        ...trade,
        exitPrice: currentPrice,
        profit,
        profitPercent,
        status: 'closed',
        closedAt: new Date().toISOString(),
        duration: Date.now() - new Date(trade.openedAt).getTime(),
        fee,
      }

      this.storage.saveTrade(closedTrade)
      console.log(`TRADE CLOSED: ${reason.toUpperCase()} | ${trade.symbol} | P/L: ${profit.toFixed(2)} USDT (${profitPercent.toFixed(2)}%)`)
    } catch (error) {
      console.error(`Failed to close trade ${trade.id}:`, error)
    }
  }

  private async checkReviewSchedule() {
    const hoursSinceLastReview = (Date.now() - this.lastReviewTime) / (1000 * 60 * 60)
    if (hoursSinceLastReview >= this.config.review.intervalHours) {
      console.log('Running scheduled review...')
      await this.reviewAgent.runReview(this.storage)
      this.lastReviewTime = Date.now()
    }
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

const bot = new TradingBot()

process.on('SIGINT', () => {
  console.log('\nShutting down bot...')
  bot.stop()
  process.exit(0)
})

process.on('SIGTERM', () => {
  bot.stop()
  process.exit(0)
})

bot.start().catch(console.error)

export { TradingBot }
export default bot
