import { JsonStorage } from '../../../../bot/storage/storage'

const storage = new JsonStorage()

export async function GET() {
  const externalSignals = storage.getExternalSignals(100)
  const pending = storage.getPendingExternalSignals()
  return Response.json({ pending: pending.length, signals: externalSignals.reverse() })
}
