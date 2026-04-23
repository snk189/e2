@echo off
echo ===========================================
echo Warming up BiteSpeed Ecosystem...
echo Bringing all systems online in THIS window
echo ===========================================
echo [INFO] Localtunnel is unreliable/offline. Switching to Ngrok!
echo A new window will pop up with your Ngrok URL.
echo Open that Ngrok URL on your phone's browser!
echo ===========================================

:: Start ngrok in a separate window so you can easily copy the URL
start "Ngrok Tunnel" cmd /k "ngrok http 5173"

:: Start the backend and frontend in the current window
npx --yes concurrently --kill-others -n "BACKEND,FRONTEND" -c "bgBlue.bold,bgMagenta.bold" "cd backend && node server.js" "cd frontend && npm run dev"
