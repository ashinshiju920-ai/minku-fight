@echo off
title MINKU-FIGHT — Wi-Fi Stick Fighting Duel
echo ======================================================
echo   MINKU-FIGHT — Wi-Fi Stick Fighting Duel
echo ======================================================
echo Starting local Wi-Fi game server...
start "" http://localhost:8080
node server.js
pause
