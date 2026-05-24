import { JsonStorage } from '../../../../bot/storage/storage'

const storage = new JsonStorage()

export async function GET() {
  const signals = storage.getSignals(50)
  return Response.json(signals.reverse())
}
