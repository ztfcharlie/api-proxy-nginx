@echo off
echo === Killing all Hub Servers... ===
taskkill /F /IM hub-server.exe >nul 2>&1
echo === Killing all Agents... ===
taskkill /F /IM agent.exe >nul 2>&1
echo === Cleanup Done. ===
