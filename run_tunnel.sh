#!/data/data/com.termux/files/usr/bin/bash

echo "🔄 Starting auto-reconnect tunnel..."
while true
do
  echo ""
  echo "🚀 Connecting to localhost.run..."
  ssh -R 80:localhost:3000 nokey@localhost.run
  echo ""
  echo "⚠️ Tunnel disconnected! Reconnecting in 5 seconds..."
  sleep 5
done
