import * as fs from 'fs'
import * as path from 'path'

const DATA_DIR = path.resolve(process.cwd(), 'data')

export interface TradeRecord {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  entryPrice: number
  exitPrice: number | null
  amount: number
  totalCost: number
  profit: number | null
  profitPercent: number | null
  status: 'open' | 'closed' | 'cancelled'
  strategy: string
  reason: string
  stopLoss: number | null
  takeProfit: number | null
  openedAt: string
  closedAt: string | null
  duration: number | null
  fee: number | null
}

export interface SignalRecord {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  price: number
  reason: string
  indicators: any
  executed: boolean
  timestamp: string
}

export interface ExternalSignal {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  entryPrice: number
  stopLoss: number
  takeProfit: number
  reason: string
  status: 'pending' | 'executed' | 'failed'
  source: string
  createdAt: string
  executedAt: string | null
  tradeId: string | null
  error: string | null
}

export interface ReviewRecord {
  id: string
  timestamp: string
  period: { from: string; to: string }
  totalTrades: number
  winTrades: number
  lossTrades: number
  winRate: number
  totalProfit: number
  totalLoss: number
  netProfit: number
  biggestWin: number
  biggestLoss: number
  averageProfit: number
  averageLoss: number
  mistakes: string[]
  recommendations: string[]
  metrics: {
    sharpeRatio: number
    maxDrawdown: number
    profitFactor: number
  }
}

export class JsonStorage {
  private tradesFile: string
  private signalsFile: string
  private reviewsFile: string
  private botStateFile: string
  private externalSignalsFile: string

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    this.tradesFile = path.join(DATA_DIR, 'trades.json')
    this.signalsFile = path.join(DATA_DIR, 'signals.json')
    this.reviewsFile = path.join(DATA_DIR, 'reviews.json')
    this.botStateFile = path.join(DATA_DIR, 'bot-state.json')
    this.externalSignalsFile = path.join(DATA_DIR, 'external-signals.json')
    this.ensureFile(this.tradesFile, [])
    this.ensureFile(this.signalsFile, [])
    this.ensureFile(this.reviewsFile, [])
    this.ensureFile(this.botStateFile, { running: false, startedAt: null, lastCheck: null })
    this.ensureFile(this.externalSignalsFile, [])
  }

  private ensureFile(filePath: string, defaultContent: any) {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2))
    }
  }

  private readJSON<T>(filePath: string): T {
    const data = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(data)
  }

  private writeJSON(filePath: string, data: any) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
  }

  saveTrade(trade: TradeRecord) {
    const trades = this.readJSON<TradeRecord[]>(this.tradesFile)
    const idx = trades.findIndex(t => t.id === trade.id)
    if (idx >= 0) {
      trades[idx] = trade
    } else {
      trades.push(trade)
    }
    this.writeJSON(this.tradesFile, trades)
  }

  getTrades(): TradeRecord[] {
    return this.readJSON<TradeRecord[]>(this.tradesFile)
  }

  getOpenTrades(): TradeRecord[] {
    return this.getTrades().filter(t => t.status === 'open')
  }

  getClosedTrades(from?: string, to?: string): TradeRecord[] {
    let trades = this.getTrades().filter(t => t.status === 'closed')
    if (from) {
      trades = trades.filter(t => t.closedAt && t.closedAt >= from)
    }
    if (to) {
      trades = trades.filter(t => t.closedAt && t.closedAt <= to)
    }
    return trades
  }

  getTodayTrades(): TradeRecord[] {
    const today = new Date().toISOString().split('T')[0]
    return this.getTrades().filter(t => t.openedAt.startsWith(today))
  }

  saveSignal(signal: SignalRecord) {
    const signals = this.readJSON<SignalRecord[]>(this.signalsFile)
    signals.push(signal)
    if (signals.length > 1000) {
      signals.splice(0, signals.length - 1000)
    }
    this.writeJSON(this.signalsFile, signals)
  }

  getSignals(limit: number = 100): SignalRecord[] {
    const signals = this.readJSON<SignalRecord[]>(this.signalsFile)
    return signals.slice(-limit)
  }

  addExternalSignal(signal: ExternalSignal) {
    const signals = this.readJSON<ExternalSignal[]>(this.externalSignalsFile)
    signals.push(signal)
    this.writeJSON(this.externalSignalsFile, signals)
  }

  getPendingExternalSignals(): ExternalSignal[] {
    const signals = this.readJSON<ExternalSignal[]>(this.externalSignalsFile)
    return signals.filter(s => s.status === 'pending')
  }

  getExternalSignals(limit: number = 50): ExternalSignal[] {
    const signals = this.readJSON<ExternalSignal[]>(this.externalSignalsFile)
    return signals.slice(-limit)
  }

  updateExternalSignal(id: string, updates: Partial<ExternalSignal>) {
    const signals = this.readJSON<ExternalSignal[]>(this.externalSignalsFile)
    const idx = signals.findIndex(s => s.id === id)
    if (idx >= 0) {
      signals[idx] = { ...signals[idx], ...updates }
      this.writeJSON(this.externalSignalsFile, signals)
    }
  }

  saveReview(review: ReviewRecord) {
    const reviews = this.readJSON<ReviewRecord[]>(this.reviewsFile)
    reviews.push(review)
    this.writeJSON(this.reviewsFile, reviews)
  }

  getReviews(limit: number = 10): ReviewRecord[] {
    const reviews = this.readJSON<ReviewRecord[]>(this.reviewsFile)
    return reviews.slice(-limit)
  }

  getBotState(): { running: boolean; startedAt: string | null; lastCheck: string | null; balance: number | null } {
    return this.readJSON(this.botStateFile)
  }

  updateBotState(state: Partial<{ running: boolean; startedAt: string | null; lastCheck: string | null; balance: number | null }>) {
    const current = this.getBotState()
    this.writeJSON(this.botStateFile, { ...current, ...state })
  }

  getTodaysStats() {
    const trades = this.getTodayTrades()
    const closed = trades.filter(t => t.status === 'closed')
    const wins = closed.filter(t => (t.profit || 0) > 0)
    const losses = closed.filter(t => (t.profit || 0) < 0)
    const totalProfit = closed.reduce((sum, t) => sum + (t.profit || 0), 0)
    return {
      totalTrades: trades.length,
      openTrades: trades.filter(t => t.status === 'open').length,
      closedTrades: closed.length,
      wins: wins.length,
      losses: losses.length,
      winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
      totalProfit,
      totalFees: closed.reduce((sum, t) => sum + (t.fee || 0), 0),
    }
  }

  getOverallStats() {
    const trades = this.getTrades()
    const closed = trades.filter(t => t.status === 'closed')
    const wins = closed.filter(t => (t.profit || 0) > 0)
    const losses = closed.filter(t => (t.profit || 0) < 0)
    return {
      totalTrades: trades.length,
      openTrades: trades.filter(t => t.status === 'open').length,
      closedTrades: closed.length,
      wins: wins.length,
      losses: losses.length,
      winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
      totalProfit: closed.reduce((sum, t) => sum + (t.profit || 0), 0),
      totalFees: closed.reduce((sum, t) => sum + (t.fee || 0), 0),
    }
  }
}
