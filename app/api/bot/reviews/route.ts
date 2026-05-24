import { JsonStorage } from '../../../../bot/storage/storage'

const storage = new JsonStorage()

export async function GET() {
  const reviews = storage.getReviews()
  return Response.json(reviews.reverse())
}
