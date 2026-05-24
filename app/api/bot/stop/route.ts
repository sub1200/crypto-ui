import { JsonStorage } from '../../../../bot/storage/storage'

const storage = new JsonStorage()

export async function POST() {
  storage.updateBotState({ running: false })
  return Response.json({ message: 'Bot stopped' })
}
