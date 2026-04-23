@echo off
echo ===========================================
echo Warming up BiteSpeed Ecosystem...
echo Bringing all systems online in THIS window
echo ===========================================

npx --yes concurrently --kill-others -n "BACKEND,FRONTEND,TUNNEL" -c "bgBlue.bold,bgMagenta.bold,bgWhite.black.bold" "cd backend && node server.js" "cd frontend && npm run dev -- --host" "npx.cmd localtunnel --port 5173 --subdomain bitespeed-app-santn"
