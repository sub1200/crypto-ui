#!/bin/bash
set -e

echo "=== Starting Production Bot ==="

# Ensure data directory persists
mkdir -p data

# Start Next.js production server in background
echo "Starting Dashboard on port 3000..."
npx next start -p 3000 &
DASHBOARD_PID=$!
echo "  Dashboard PID: $DASHBOARD_PID"

# Give dashboard time to boot
sleep 8

# Start the trading bot (foreground, keeps container alive)
echo "Starting Trading Bot..."
exec npx tsx bot/index.ts
