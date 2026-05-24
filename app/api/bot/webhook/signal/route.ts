import { JsonStorage, ExternalSignal } from '../../../../../bot/storage/storage'
import { v4 as uuidv4 } from 'uuid'

const storage = new JsonStorage()

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const { symbol, side, entryPrice, stopLoss, takeProfit, reason } = body

    if (!symbol || !side || !entryPrice || !stopLoss || !takeProfit) {
      return Response.json({
        error: 'Missing required fields: symbol, side, entryPrice, stopLoss, takeProfit',
      }, { status: 400 })
    }

    if (!['buy', 'sell'].includes(side)) {
      return Response.json({ error: 'side must be "buy" or "sell"' }, { status: 400 })
    }

    const signal: ExternalSignal = {
      id: uuidv4(),
      symbol: symbol.toUpperCase().includes('/') ? symbol.toUpperCase() : `${symbol.toUpperCase()}/USDT`,
      side,
      entryPrice,
      stopLoss,
      takeProfit,
      reason: reason || 'External signal',
      status: 'pending',
      source: request.headers.get('x-source') || 'external-api',
      createdAt: new Date().toISOString(),
      executedAt: null,
      tradeId: null,
      error: null,
    }

    storage.addExternalSignal(signal)

    return Response.json({
      success: true,
      message: 'Signal received and queued for execution',
      signal: {
        id: signal.id,
        symbol: signal.symbol,
        side: signal.side,
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
      },
    })
  } catch (e: any) {
    return Response.json({ error: 'Invalid request', detail: e.message }, { status: 400 })
  }
}

export async function GET() {
  const signals = storage.getExternalSignals(50)
  const pending = storage.getPendingExternalSignals()
  return Response.json({
    total: signals.length,
    pending: pending.length,
    signals: signals.reverse(),
  })
}
