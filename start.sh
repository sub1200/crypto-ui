#!/bin/bash
# Start script for Crypto Trading Bot
# Usage: bash start.sh

echo "Starting Crypto Trading Bot..."

# Kill any existing processes on port 3000
kill $(lsof -ti:3000) 2>/dev/null

# Start Next.js dashboard in background
echo "Starting Dashboard on http://localhost:3000 ..."
nohup npx next dev -p 3000 > /tmp/bot-dashboard.log 2>&1 &
echo "  Dashboard PID: $!"

# Wait for dashboard to be ready
sleep 10

# Start the trading bot
echo "Starting Trading Bot..."
npx tsx bot/index.ts
