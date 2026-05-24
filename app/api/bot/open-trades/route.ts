import { JsonStorage } from '../../../../bot/storage/storage'

const storage = new JsonStorage()

export async function GET() {
  const trades = storage.getTrades()
  const open = trades.filter(t => t.status === 'open')
  return Response.json(open)
}
