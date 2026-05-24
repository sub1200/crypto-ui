import { spawn } from 'child_process'
import path from 'path'

let botProcess: any = null

export async function POST() {
  if (botProcess) {
    return Response.json({ message: 'Bot is already running' }, { status: 400 })
  }

  const botPath = path.resolve(process.cwd(), 'bot/index.ts')
  botProcess = spawn('npx', ['tsx', botPath], {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: { ...process.env },
  })

  botProcess.stdout.on('data', (data: Buffer) => {
    console.log(`[BOT] ${data.toString()}`)
  })

  botProcess.stderr.on('data', (data: Buffer) => {
    console.error(`[BOT ERROR] ${data.toString()}`)
  })

  botProcess.on('close', (code: number) => {
    console.log(`Bot process exited with code ${code}`)
    botProcess = null
  })

  return Response.json({ message: 'Bot started successfully' })
}
