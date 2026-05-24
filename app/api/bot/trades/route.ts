import { JsonStorage } from '../../../../bot/storage/storage'

const storage = new JsonStorage()

export async function GET() {
  const trades = storage.getTrades()
  return Response.json(trades.slice(-50).reverse())
}
