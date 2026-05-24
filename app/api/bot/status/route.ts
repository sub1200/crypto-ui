import { JsonStorage } from '../../../../bot/storage/storage'

const storage = new JsonStorage()

export async function GET() {
  const state = storage.getBotState()
  const todaysStats = storage.getTodaysStats()
  const overallStats = storage.getOverallStats()

  return Response.json({
    running: state.running,
    startedAt: state.startedAt,
    lastCheck: state.lastCheck,
    balance: state.balance || null,
    today: todaysStats,
    overall: overallStats,
  })
}
