import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
          Crypto Trading Bot
        </h1>
        <p className="text-xl text-gray-400 mb-8">
          Automated Scalping Bot on Binance Testnet
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <FeatureCard title="Scalping Strategy" desc="Quick trades with RSI + EMA + Volume analysis" />
          <FeatureCard title="External Webhook" desc="Accept signals from your program via HTTP POST" />
          <FeatureCard title="Auto Review" desc="AI agent reviews trades every 8 hours" />
          <FeatureCard title="Live Dashboard" desc="Monitor performance in real-time" />
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg text-lg font-semibold transition-colors"
        >
          Open Dashboard
        </Link>
        <div className="mt-6 text-sm text-gray-500">
          <p>Start the bot: <code className="bg-gray-800 px-2 py-1 rounded">npm run bot</code></p>
          <p className="mt-1">Run dev server: <code className="bg-gray-800 px-2 py-1 rounded">npm run dev</code></p>
        </div>

        <div className="mt-8 max-w-lg text-left bg-gray-900 rounded-lg p-4 border border-gray-800">
          <h3 className="text-sm font-semibold text-blue-400 mb-2">Webhook API - Connect Your Program</h3>
          <p className="text-xs text-gray-400 mb-2">POST your trade signals:</p>
          <pre className="text-xs text-gray-300 bg-gray-950 p-3 rounded overflow-x-auto">
{`POST /api/bot/webhook/signal
Content-Type: application/json

{
  "symbol": "BTC/USDT",
  "side": "buy",
  "entryPrice": 50000,
  "stopLoss": 49500,
  "takeProfit": 51000,
  "reason": "My signal"
}`}
          </pre>
          <p className="text-xs text-green-400 mt-2">The bot picks up signals and executes them automatically!</p>
        </div>
      </div>
    </div>
  )
}

function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <h3 className="font-semibold text-blue-400">{title}</h3>
      <p className="text-sm text-gray-400">{desc}</p>
    </div>
  )
}
