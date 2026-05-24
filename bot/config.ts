export interface BotConfig {
  exchange: {
    name: string
    apiKey: string
    secret: string
    testnet: boolean
    rateLimit: number
  }
  strategy: {
    name: string
    scalper: {
      pairs: string[]
      timeframe: string
      volumeMultiplier: number
      tradeIntervalMs: number
      minConfidence: number
      blacklist: string[]
      atrPeriod: number
      atrSlMultiplier: number
      atrTpMultiplier: number
    }
  }
  risk: {
    maxCapitalPercentPerTrade: number
    maxOpenTrades: number
    stopLossPercent: number
    takeProfitPercent: number
    dailyLossLimitPercent: number
    maxDailyTrades: number
    minBalance: number
  }
  review: {
    intervalHours: number
    pairs: string[]
    timeframe: string
  }
  signalsync: {
    apiUrl: string
    minSignalScore: number
    minQuoteVolume: number
    checkIntervalMs: number
  }
  bot: {
    checkIntervalMs: number
    logLevel: string
  }
}

export const defaultConfig: BotConfig = {
  exchange: {
    name: 'binance',
    apiKey: '',
    secret: '',
    testnet: true,
    rateLimit: 1200,
  },
  strategy: {
    name: 'scalper',
    scalper: {
      pairs: [
        'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'DOGE/USDT', 'PEPE/USDT',
        'XRP/USDT', 'ADA/USDT', 'LINK/USDT', 'AVAX/USDT',
      ],
      timeframe: '1m',
      volumeMultiplier: 1.5,
      tradeIntervalMs: 60000,
      minConfidence: 45,
      blacklist: ['BANANAS31', 'SAGA', 'FF', 'NIGHT', 'INJ', 'SUI'],
      atrPeriod: 14,
      atrSlMultiplier: 1.5,
      atrTpMultiplier: 3.0,
    },
  },
  risk: {
    maxCapitalPercentPerTrade: 3,
    maxOpenTrades: 2,
    stopLossPercent: 0.7,
    takeProfitPercent: 1.2,
    dailyLossLimitPercent: 5,
    maxDailyTrades: 20,
    minBalance: 10,
  },
  review: {
    intervalHours: 8,
    pairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
    timeframe: '1h',
  },
  signalsync: {
    apiUrl: 'https://9000-firebase-studio-1776105909394.cluster-yy7ncoxb5zd4ouvntrhoc3go3k.cloudworkstations.dev/api/signals',
    minSignalScore: 7,
    minQuoteVolume: 500000,
    checkIntervalMs: 60000,
  },
  bot: {
    checkIntervalMs: 15000,
    logLevel: 'info',
  },
}
