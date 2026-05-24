'use client'

import { useEffect, useState } from 'react'

export default function Dashboard() {
  const [status, setStatus] = useState<any>(null)
  const [trades, setTrades] = useState<any[]>([])
  const [liveTrades, setLiveTrades] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [reviews, setReviews] = useState<any[]>([])
  const [balance, setBalance] = useState<any>(null)
  const [externalSignals, setExternalSignals] = useState<any[]>([])
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    fetchData()
    fetchLivePrices()
    const dataInterval = setInterval(fetchData, 10000)
    const liveInterval = setInterval(fetchLivePrices, 3000)
    const extInterval = setInterval(fetchExternalSignals, 15000)
    return () => {
      clearInterval(dataInterval)
      clearInterval(liveInterval)
      clearInterval(extInterval)
    }
  }, [])

  async function fetchExternalSignals() {
    try {
      const res = await fetch('/api/bot/external-signals')
      const data = await res.json()
      setExternalSignals(data.signals || [])
      setPendingCount(data.pending || 0)
    } catch {}
  }

  async function fetchData() {
    const [statusRes, tradesRes, statsRes, reviewsRes] = await Promise.all([
      fetch('/api/bot/status'),
      fetch('/api/bot/trades'),
      fetch('/api/bot/stats'),
      fetch('/api/bot/reviews'),
    ])
    const statusData = await statusRes.json()
    setStatus(statusData)
    setTrades(await tradesRes.json())
    setStats(await statsRes.json())
    setReviews(await reviewsRes.json())
    setBalance(statusData.balance || null)
  }

  async function fetchLivePrices() {
    try {
      const res = await fetch('/api/bot/live-prices')
      const data = await res.json()
      if (data.trades) setLiveTrades(data.trades)
    } catch {}
  }

  const hasOpenTrades = liveTrades.length > 0

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <h1 className="text-3xl font-bold mb-6">Trading Bot Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Bot Status" value={status?.running ? 'Running' : 'Stopped'} color={status?.running ? 'green' : 'red'} />
        <StatCard label="Balance" value={balance ? `${balance.toFixed(2)} USDT` : '---'} color="green" />
        <StatCard label="Today P/L" value={`${(stats?.today?.totalProfit || 0).toFixed(2)} USDT`} color={(stats?.today?.totalProfit || 0) >= 0 ? 'green' : 'red'} />
        <StatCard label="Win Rate" value={`${(stats?.today?.winRate || 0).toFixed(1)}%`} color={(stats?.today?.winRate || 0) >= 50 ? 'green' : 'red'} />
        <StatCard label="Total Trades" value={`${stats?.today?.totalTrades || 0}`} color="blue" />
      </div>

      {hasOpenTrades && (
        <div className="bg-gray-900 rounded-lg p-4 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            Open Trades
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-gray-500 font-normal">live</span>
          </h2>
          <div className="space-y-3">
            {liveTrades.map((t: any) => {
              const pnl = t.unrealizedPnL ?? 0
              const pnlPct = t.unrealizedPnLPercent ?? 0
              const isProfit = pnl >= 0
              const nearSl = t.stopLoss && t.currentPrice ? (
                t.side === 'buy'
                  ? t.currentPrice <= t.stopLoss * 1.01
                  : t.currentPrice >= t.stopLoss * 0.99
              ) : false
              const nearTp = t.takeProfit && t.currentPrice ? (
                t.side === 'buy'
                  ? t.currentPrice >= t.takeProfit * 0.99
                  : t.currentPrice <= t.takeProfit * 1.01
              ) : false

              return (
                <div key={t.id} className={`border rounded-lg p-4 ${
                  nearSl ? 'border-red-600 bg-red-950/20' :
                  nearTp ? 'border-green-600 bg-green-950/20' :
                  'border-yellow-800 bg-yellow-950/10'
                }`}>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${t.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                        {t.side.toUpperCase()} {t.symbol}
                      </span>
                      <span className="px-2 py-0.5 bg-yellow-900/50 text-yellow-400 rounded text-xs">OPEN</span>
                      {nearSl && <span className="px-2 py-0.5 bg-red-900/50 text-red-400 rounded text-xs">NEAR SL</span>}
                      {nearTp && <span className="px-2 py-0.5 bg-green-900/50 text-green-400 rounded text-xs">NEAR TP</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-3 text-sm">
                    <div>
                      <div className="text-gray-500 text-xs">Size</div>
                      <div className="text-white font-mono">{(t.totalCost || 0).toFixed(2)} USDT</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">Entry</div>
                      <div className="text-white font-mono">{t.entryPrice}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">Live Price</div>
                      <div className="text-blue-400 font-mono font-bold">{t.currentPrice || '---'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">Stop Loss</div>
                      <div className={`font-mono ${nearSl ? 'text-red-400 font-bold' : 'text-red-400'}`}>{t.stopLoss}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">Take Profit</div>
                      <div className={`font-mono ${nearTp ? 'text-green-400 font-bold' : 'text-green-400'}`}>{t.takeProfit}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">Unrealized P/L</div>
                      <div className={`font-mono font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                        {pnl > 0 ? '+' : ''}{pnl.toFixed(2)} USDT
                        <span className="text-xs ml-1">({pnlPct > 0 ? '+' : ''}{pnlPct.toFixed(2)}%)</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">{t.openedAt?.split('T')[1]?.split('.')[0]} | {t.reason}</div>
                  {t.currentPrice && (
                    <div className="mt-2 w-full bg-gray-800 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-500 ${
                          isProfit ? 'bg-green-500' : 'bg-red-500'
                        }`}
                        style={{
                          width: `${Math.min(Math.abs(pnlPct) * 20, 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-900 rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">Overall Statistics</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>Total Trades: <span className="text-blue-400">{stats?.overall?.totalTrades || 0}</span></div>
            <div>Open Trades: <span className="text-yellow-400">{stats?.overall?.openTrades || 0}</span></div>
            <div>Closed Trades: <span className="text-blue-400">{stats?.overall?.closedTrades || 0}</span></div>
            <div>Wins: <span className="text-green-400">{stats?.overall?.wins || 0}</span></div>
            <div>Losses: <span className="text-red-400">{stats?.overall?.losses || 0}</span></div>
            <div>Win Rate: <span className="text-purple-400">{stats?.overall?.winRate?.toFixed(1) || 0}%</span></div>
            <div>Total P/L: <span className={(stats?.overall?.totalProfit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
              {(stats?.overall?.totalProfit || 0).toFixed(2)} USDT
            </span></div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">Performance by Symbol</h2>
          <div className="space-y-2">
            {stats?.profitBySymbol?.map((s: any) => (
              <div key={s.symbol} className="flex justify-between text-sm">
                <span>{s.symbol}</span>
                <span>Trades: {s.trades}</span>
                <span className={s.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {s.profit.toFixed(2)} USDT
                </span>
                <span className="text-purple-400">{s.winRate.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="bg-gray-900 rounded-lg p-4 mb-6 border border-blue-800">
          <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
            External Signals
            <span className="px-2 py-0.5 bg-blue-900/50 text-blue-400 rounded text-xs">{pendingCount} pending</span>
          </h2>
          <div className="space-y-2">
            {externalSignals.filter((s: any) => s.status === 'pending').slice(0, 5).map((s: any) => (
              <div key={s.id} className="border border-blue-900/50 rounded p-2 text-sm flex justify-between items-center">
                <div>
                  <span className={s.side === 'buy' ? 'text-green-400' : 'text-red-400'}>{s.side.toUpperCase()}</span>
                  <span className="text-white ml-2">{s.symbol}</span>
                  <span className="text-gray-500 ml-2">@ {s.entryPrice}</span>
                </div>
                <div className="text-gray-400 text-xs">{s.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">Recent Trades</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {trades.slice(0, 20).map((t: any) => (
              <div key={t.id} className="border border-gray-800 rounded p-2 text-sm">
                <div className="flex justify-between">
                  <span className={t.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
                    {t.side.toUpperCase()} {t.symbol}
                  </span>
                  <span className={t.status === 'open' ? 'text-yellow-400' : 'text-blue-400'}>
                    {t.status}
                  </span>
                </div>
                <div className="text-gray-400">
                  Entry: {t.entryPrice} | Size: {(t.totalCost || 0).toFixed(2)} USDT
                </div>
                {t.profit !== null && (
                  <div className={t.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
                    P/L: {t.profit.toFixed(2)} USDT ({t.profitPercent?.toFixed(2)}%)
                  </div>
                )}
                <div className="text-gray-500 text-xs">{t.openedAt?.split('T')[1]?.split('.')[0]}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">Auto Reviews</h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {reviews.map((r: any) => (
              <div key={r.id} className="border border-gray-800 rounded p-3">
                <div className="text-sm text-gray-400">{r.timestamp?.split('T')[0]} {r.timestamp?.split('T')[1]?.split('.')[0]}</div>
                <div className="grid grid-cols-3 gap-2 text-sm mt-2">
                  <div>Trades: {r.totalTrades}</div>
                  <div className="text-green-400">Wins: {r.winTrades}</div>
                  <div className="text-red-400">Losses: {r.lossTrades}</div>
                  <div>Win Rate: <span className="text-purple-400">{r.winRate?.toFixed(1)}%</span></div>
                  <div className={(r.netProfit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                    Net: {r.netProfit?.toFixed(2)}
                  </div>
                  <div>PF: {r.metrics?.profitFactor?.toFixed(2)}</div>
                </div>
                {r.mistakes?.length > 0 && (
                  <div className="mt-2">
                    <div className="text-red-400 text-sm font-semibold">Mistakes:</div>
                    {r.mistakes.map((m: string, i: number) => (
                      <div key={i} className="text-red-300 text-xs">- {m}</div>
                    ))}
                  </div>
                )}
                {r.recommendations?.length > 0 && (
                  <div className="mt-1">
                    <div className="text-green-400 text-sm font-semibold">Recommendations:</div>
                    {r.recommendations.map((rec: string, i: number) => (
                      <div key={i} className="text-green-300 text-xs">- {rec}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    green: 'text-green-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
    yellow: 'text-yellow-400',
    purple: 'text-purple-400',
  }
  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <div className="text-gray-400 text-sm">{label}</div>
      <div className={`text-2xl font-bold ${colorMap[color] || 'text-white'}`}>{value}</div>
    </div>
  )
}
